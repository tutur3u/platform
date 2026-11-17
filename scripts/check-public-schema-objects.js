#!/usr/bin/env node
/**
 * Public schema guard (static layer).
 *
 * Fails when application relations are added to the PostgREST-exposed public
 * schema, when the shrink-only allowlist grows, or when a relation recorded as
 * moved to private is still read directly by a client. The authoritative
 * catalog comparison runs on a reset database in
 * apps/database/scripts/verify-public-schema-catalog.mjs.
 *
 * Base for the shrink-only comparison, in order:
 *   PUBLIC_SCHEMA_BASE_SHA        explicit commit (CI pushes pass github.event.before)
 *   GITHUB_BASE_REF               pull request base branch, fetched as needed
 *   origin/<PUBLIC_SCHEMA_BASE_BRANCH or main>   merge-base with HEAD
 * An unreadable base fails closed. The only exception is the introducing
 * change, where the base has neither the allowlist nor this script.
 *
 * Exit codes: 0 pass, 1 violation, 2 setup or parse error.
 */
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const {
  ALLOWLIST_PATH,
  compareWithBase,
  expiredCompatViews,
  parseAllowlist,
} = require('./public-schema-guard/allowlist.js');
const { lintMigration } = require('./public-schema-guard/migration-lint.js');
const { scanCallers } = require('./public-schema-guard/callers.js');

const SCRIPT_PATH = 'scripts/check-public-schema-objects.js';
const TYPES_PATH = 'packages/types/src/supabase.ts';
const MIGRATIONS_DIR = 'apps/database/supabase/migrations';
const ZERO_SHA = /^0+$/u;

class SetupError extends Error {}

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return {
    ok: result.status === 0,
    stdout: (result.stdout ?? '').trim(),
    stderr: (result.stderr ?? '').trim(),
  };
}

function resolveBase({ cwd, env }) {
  const explicit = env.PUBLIC_SCHEMA_BASE_SHA?.trim();
  if (explicit) {
    if (ZERO_SHA.test(explicit))
      throw new SetupError(
        'PUBLIC_SCHEMA_BASE_SHA is the zero SHA; no base to compare'
      );
    const verified = git(
      ['rev-parse', '--verify', '--quiet', `${explicit}^{commit}`],
      cwd
    );
    if (!verified.ok) {
      git(
        ['fetch', '--no-tags', '--quiet', '--depth=1', 'origin', explicit],
        cwd
      );
      const retried = git(
        ['rev-parse', '--verify', '--quiet', `${explicit}^{commit}`],
        cwd
      );
      if (!retried.ok)
        throw new SetupError(`base commit ${explicit} is not available`);
      return retried.stdout;
    }
    return verified.stdout;
  }
  const branch = env.GITHUB_BASE_REF || env.PUBLIC_SCHEMA_BASE_BRANCH || 'main';
  const remoteRef = `refs/remotes/origin/${branch}`;
  if (env.GITHUB_BASE_REF) {
    const fetched = git(
      [
        'fetch',
        '--no-tags',
        '--quiet',
        '--depth=1',
        'origin',
        `+refs/heads/${branch}:${remoteRef}`,
      ],
      cwd
    );
    if (!fetched.ok)
      throw new SetupError(`could not fetch ${branch}: ${fetched.stderr}`);
  }
  if (!git(['rev-parse', '--verify', '--quiet', remoteRef], cwd).ok)
    throw new SetupError(
      `${remoteRef} is not available; fetch it or set PUBLIC_SCHEMA_BASE_SHA`
    );
  for (let attempt = 0; attempt < 8; attempt++) {
    const mergeBase = git(['merge-base', remoteRef, 'HEAD'], cwd);
    if (mergeBase.ok) return mergeBase.stdout;
    if (git(['rev-parse', '--is-shallow-repository'], cwd).stdout !== 'true')
      break;
    const deepen = attempt < 7 ? ['--deepen=200'] : ['--unshallow'];
    git(
      [
        'fetch',
        '--no-tags',
        '--quiet',
        ...deepen,
        'origin',
        `+refs/heads/${branch}:${remoteRef}`,
      ],
      cwd
    );
  }
  throw new SetupError(`no merge-base between ${remoteRef} and HEAD`);
}

function readAtBase(base, file, cwd) {
  if (!git(['cat-file', '-e', `${base}:${file}`], cwd).ok) return null;
  const shown = git(['show', `${base}:${file}`], cwd);
  if (!shown.ok)
    throw new SetupError(`could not read ${file} at ${base}: ${shown.stderr}`);
  return shown.stdout;
}

/** Keys of public.Tables and public.Views in the generated types. */
function parsePublicTypes(source) {
  const lines = source.split('\n');
  const start = lines.indexOf('  public: {');
  if (start < 0)
    throw new SetupError(`${TYPES_PATH}: public schema block not found`);
  const sections = { Tables: new Set(), Views: new Set() };
  let current = null;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^ {2}\S/u.test(line)) break;
    const section = /^ {4}(\w+): \{/u.exec(line);
    if (section) {
      current = sections[section[1]] ?? null;
      continue;
    }
    const key = /^ {6}([a-z0-9_]+): \{$/u.exec(line);
    if (current && key) current.add(key[1]);
  }
  if (sections.Tables.size === 0)
    throw new SetupError(`${TYPES_PATH}: no public tables parsed`);
  return sections;
}

function checkTypes(allowlist, types) {
  const findings = [];
  const permitted = new Set([
    ...Object.keys(allowlist.relations),
    ...Object.keys(allowlist.serviceRoleCompatViews),
    ...Object.keys(allowlist.typesAhead),
  ]);
  for (const name of Object.keys(allowlist.typesAhead))
    if (!types.Tables.has(name) && !types.Views.has(name))
      findings.push(
        `${ALLOWLIST_PATH}: typesAhead.${name} is stale: the generated public types no longer declare it`
      );
  for (const [section, names] of Object.entries(types))
    for (const name of names)
      if (!permitted.has(name))
        findings.push(
          `${TYPES_PATH}: public.${section}.${name} is not allowlisted; create it in private`
        );
  // Committed types can lag the migrations, so a missing name is not proof
  // of staleness; the catalog check on a reset database owns that direction.
  for (const [name, entry] of Object.entries(allowlist.relations)) {
    const typedKind = types.Tables.has(name)
      ? 'table'
      : types.Views.has(name)
        ? 'view'
        : null;
    if (typedKind && typedKind !== entry.kind)
      findings.push(
        `${ALLOWLIST_PATH}: relations.${name} kind ${entry.kind} does not match the generated types`
      );
  }
  return findings;
}

function lintMigrations(allowlist, cwd) {
  const dir = path.join(cwd, MIGRATIONS_DIR);
  const allowed = new Set([
    ...Object.keys(allowlist.relations),
    ...Object.keys(allowlist.serviceRoleCompatViews),
  ]);
  const allowedFunctions = new Set(Object.keys(allowlist.functions.names));
  const findings = [];
  for (const file of fs.readdirSync(dir).sort()) {
    const version = /^(\d{14})_.*\.sql$/u.exec(file)?.[1];
    if (!version || version <= allowlist.lintAfterVersion) continue;
    findings.push(
      ...lintMigration({
        file: `${MIGRATIONS_DIR}/${file}`,
        sql: fs.readFileSync(path.join(dir, file), 'utf8'),
        allowed,
        allowedFunctions,
        functionsEnforced: allowlist.functions.enforced,
      })
    );
  }
  return findings;
}

function run({
  cwd = process.cwd(),
  env = process.env,
  log = console.log,
  error = console.error,
} = {}) {
  let allowlist;
  let base = null;
  try {
    allowlist = parseAllowlist(
      fs.readFileSync(path.join(cwd, ALLOWLIST_PATH), 'utf8')
    );
    const baseSha = resolveBase({ cwd, env });
    const baseText = readAtBase(baseSha, ALLOWLIST_PATH, cwd);
    if (baseText === null) {
      if (readAtBase(baseSha, SCRIPT_PATH, cwd) !== null)
        throw new SetupError(
          `${ALLOWLIST_PATH} is missing at base ${baseSha} while the guard exists there`
        );
      log(
        `public-schema guard: introducing change (base ${baseSha.slice(0, 12)} has no allowlist)`
      );
    } else {
      base = parseAllowlist(baseText, { base: true });
    }
  } catch (cause) {
    error(`public-schema guard: ${cause.message}`);
    return 2;
  }

  const errors = [];
  const warnings = [];
  if (base)
    errors.push(
      ...compareWithBase(allowlist, base).map((m) => `${ALLOWLIST_PATH}: ${m}`)
    );
  errors.push(
    ...expiredCompatViews(allowlist).map((m) => `${ALLOWLIST_PATH}: ${m}`)
  );
  try {
    errors.push(
      ...checkTypes(
        allowlist,
        parsePublicTypes(fs.readFileSync(path.join(cwd, TYPES_PATH), 'utf8'))
      )
    );
  } catch (cause) {
    error(`public-schema guard: ${cause.message}`);
    return 2;
  }
  for (const finding of lintMigrations(allowlist, cwd)) {
    const text = `${finding.file}:${finding.line}: ${finding.kind}: ${finding.message}`;
    (finding.severity === 'error' ? errors : warnings).push(text);
  }
  for (const finding of scanCallers(cwd, new Set(Object.keys(allowlist.moved))))
    errors.push(
      `${finding.file}:${finding.line}: ${finding.kind}: ${finding.message}`
    );

  for (const warning of warnings) log(`warning: ${warning}`);
  if (errors.length) {
    for (const message of errors) error(`error: ${message}`);
    error(
      `public-schema guard: ${errors.length} violation(s). See apps/docs/build/devops/public-schema-privatization.mdx`
    );
    return 1;
  }
  log(
    `public-schema guard: ${Object.keys(allowlist.relations).length} allowlisted relations, ${Object.keys(allowlist.moved).length} moved, wave ${allowlist.currentWave}`
  );
  return 0;
}

if (require.main === module) process.exitCode = run();

module.exports = { checkTypes, parsePublicTypes, resolveBase, run };
