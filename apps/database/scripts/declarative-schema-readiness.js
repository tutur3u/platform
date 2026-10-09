#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  getBundledSupabaseBinaryPath,
  getSupabaseWrapperPath,
  workspaceDir,
} from './run-supabase.js';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Inventory bytes only. Never export SQL, rows, credentials, or CLI stderr.
export function inventory(directory, prefix = '') {
  if (!fs.existsSync(directory)) return [];
  if (!fs.lstatSync(directory).isDirectory()) {
    throw new Error('inventory-root-not-directory');
  }
  return fs
    .readdirSync(directory)
    .sort()
    .flatMap((name) => {
      const absolute = path.join(directory, name);
      const relative = `${prefix}${name}`;
      const stat = fs.lstatSync(absolute);
      if (stat.isSymbolicLink()) throw new Error('inventory-symlink');
      if (stat.isDirectory()) return inventory(absolute, `${relative}/`);
      if (!stat.isFile()) throw new Error('inventory-not-file');
      return [{ path: relative, sha256: hash(fs.readFileSync(absolute)) }];
    });
}

export function readSettings(config) {
  const sections = new Map();
  let section = '';
  for (const original of config.split(/\r?\n/)) {
    const line = original.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const header = line.match(/^\[([\w.]+)\]$/);
    if (header) {
      section = header[1];
      if (sections.has(section)) throw new Error('duplicate-config-section');
      sections.set(section, []);
    } else {
      const lines = sections.get(section) ?? [];
      lines.push(line);
      sections.set(section, lines);
    }
  }
  const db = sections.get('db') ?? [];
  const major = db.filter((line) => /^major_version\s*=/.test(line));
  const pgdelta = sections.get('experimental.pgdelta') ?? [];
  const enabled = pgdelta.filter((line) => /^enabled\s*=/.test(line));
  return {
    // Conservative inspection of known keys, not a general TOML parser.
    postgresMajor:
      major.length === 1
        ? Number(major[0].match(/^major_version\s*=\s*(\d+)$/)?.[1]) || null
        : null,
    engine:
      enabled.length === 1 && /^enabled\s*=\s*true$/.test(enabled[0])
        ? 'pg-delta'
        : 'legacy-or-unverified',
    legacySchemaPathsPresent: (sections.get('db.migrations') ?? []).some(
      (line) => /^schema_paths\s*=/.test(line)
    ),
  };
}

export function probeCli(databaseDir, { runner = spawnSync } = {}) {
  const unavailable = {
    installedVersion: null,
    binarySha256: null,
    generate: false,
    sync: false,
  };
  try {
    // No installer, PATH/global fallback, or SUPABASE_CLI_BINARY_OVERRIDE.
    const binary = getBundledSupabaseBinaryPath(
      getSupabaseWrapperPath(databaseDir)
    );
    if (!binary) return unavailable;
    const binarySha256 = hash(fs.readFileSync(binary));
    const run = (args) => {
      const result = runner(binary, args, {
        cwd: databaseDir,
        encoding: 'utf8',
        timeout: 10000,
        maxBuffer: 256 * 1024,
        env: {
          PATH: process.env.PATH ?? '',
          NO_COLOR: '1',
          SUPABASE_NO_UPDATE_NOTIFIER: '1',
        },
      });
      return result.status === 0 && !result.error ? result.stdout : '';
    };
    const version = run(['--version']).trim();
    const installedVersion = /^\d+\.\d+\.\d+$/.test(version) ? version : null;
    const generate = run(['db', 'schema', 'declarative', 'generate', '--help']);
    const sync = run(['db', 'schema', 'declarative', 'sync', '--help']);
    return {
      installedVersion,
      binarySha256,
      generate:
        /supabase db schema declarative generate\b/.test(generate) &&
        /--local\b/.test(generate),
      sync:
        /supabase db schema declarative sync\b/.test(sync) &&
        /--no-apply\b/.test(sync),
    };
  } catch {
    return unavailable;
  }
}

export function readiness(root, { probe = probeCli } = {}) {
  const databaseDir = path.join(root, 'apps/database');
  const supabaseDir = path.join(databaseDir, 'supabase');
  const config = fs.readFileSync(path.join(supabaseDir, 'config.toml'));
  const settings = readSettings(config.toString('utf8'));
  const migrations = inventory(path.join(supabaseDir, 'migrations'));
  const schemas = inventory(path.join(supabaseDir, 'schemas'));
  const manifest = JSON.parse(
    fs.readFileSync(path.join(databaseDir, 'package.json'), 'utf8')
  );
  const pinnedVersion =
    manifest.devDependencies?.supabase ??
    manifest.dependencies?.supabase ??
    null;
  const cli = probe(databaseDir);
  const blockers = [
    'baseline-replay-and-noop-diff-unverified',
    'migration-owner-reconciliation-required',
  ];
  if (!/^\d+\.\d+\.\d+$/.test(pinnedVersion ?? ''))
    blockers.push('cli-pin-not-exact');
  if (cli.installedVersion !== pinnedVersion || !cli.installedVersion)
    blockers.push('cli-version-unbound');
  if (!cli.generate || !cli.sync)
    blockers.push('cli-declarative-commands-unsupported');
  if (settings.engine !== 'pg-delta') blockers.push('pgdelta-not-enabled');
  if (!settings.postgresMajor) blockers.push('postgres-major-unverified');
  if (settings.legacySchemaPathsPresent)
    blockers.push('legacy-schema-paths-require-review');
  if (!schemas.some((file) => file.path.endsWith('.sql')))
    blockers.push('schema-tree-missing');
  if (!migrations.length) blockers.push('migration-history-missing');
  const timestamps = new Set();
  for (const file of migrations) {
    const timestamp = file.path.match(/^(\d{14})_[^/]+\.sql$/)?.[1];
    if (!timestamp || timestamps.has(timestamp))
      blockers.push('migration-history-invalid');
    if (timestamp) timestamps.add(timestamp);
  }
  return {
    formatVersion: 1,
    status: 'preparation',
    ready: false,
    baseline: 'unverified',
    blockers: [...new Set(blockers)],
    identity: {
      configSha256: hash(config),
      lockSha256: hash(fs.readFileSync(path.join(root, 'bun.lock'))),
      migrationsSha256: hash(JSON.stringify(migrations)),
      schemasSha256: hash(JSON.stringify(schemas)),
      pinnedVersion,
      ...settings,
    },
    cli,
    migrations,
    schemas,
    scope:
      'read-only inventory and bounded CLI help; no database connection or adoption authorization',
  };
}

export function main(
  argv = process.argv.slice(2),
  {
    stdout = process.stdout,
    stderr = process.stderr,
    root = path.resolve(workspaceDir, '../..'),
    probe,
  } = {}
) {
  if (argv.length === 1 && argv[0] === '--help') {
    stdout.write(
      'Usage: node apps/database/scripts/declarative-schema-readiness.js [--json]\nRead-only preparation report. Exit 2 means adoption is held. No execution or connection flags are accepted.\n'
    );
    return 0;
  }
  if (argv.length > 1 || (argv.length === 1 && argv[0] !== '--json')) {
    stderr.write('Unsupported argument. Only --json or --help is accepted.\n');
    return 1;
  }
  try {
    const report = readiness(root, { probe });
    stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return 2;
  } catch {
    // Filesystem/CLI errors may contain SQL or secret-bearing paths. Do not echo them.
    stderr.write(
      'Readiness inspection failed; adoption remains held. Check checkout files and dependency setup.\n'
    );
    return 1;
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  process.exitCode = main();
}
