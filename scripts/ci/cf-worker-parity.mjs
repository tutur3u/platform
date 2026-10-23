#!/usr/bin/env node
// Deployment-identity parity between a former Wrangler configuration and the
// cf configuration (cloudflare.config.ts or its emitted Build Output).
//
// Both shapes normalize to the same record. Settings outside the mapped set
// are retained under `unmapped` so an unreviewed difference fails the
// comparison instead of disappearing.
//
// CLI: node scripts/ci/cf-worker-parity.mjs <app-dir> <baseline.json>
// compares the app's emitted .cloudflare/output/v0 tree with the baseline.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// Wrangler keys that only steer local bundling or tooling, never the
// uploaded Worker identity.
const WRANGLER_TOOLING_KEYS = new Set([
  '$schema',
  'main',
  'alias',
  'dev',
  'build',
  'rules',
  'no_bundle',
  'find_additional_modules',
  'base_dir',
  'preserve_file_names',
  'minify',
]);

const CF_TOOLING_KEYS = new Set(['entrypoint']);

function sorted(values) {
  return [...values].sort();
}

function sortedObject(entries) {
  return Object.fromEntries(
    [...entries].sort(([left], [right]) => left.localeCompare(right))
  );
}

const camel = (key) => key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

/** Recursively camel-case keys and sort them, so both shapes compare equal. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value === null || typeof value !== 'object') return value;
  return sortedObject(
    Object.entries(value).map(([key, item]) => [camel(key), canonical(item)])
  );
}

/** Keys of `value` outside `known`, canonicalized; undefined when none. */
function extraKeys(value, known) {
  const extra = Object.entries(value ?? {}).filter(([key]) => !known.has(key));
  return extra.length ? canonical(Object.fromEntries(extra)) : undefined;
}

function addUnmapped(identity, key, value) {
  if (value === undefined) return;
  identity.unmapped[key] = [...(identity.unmapped[key] ?? []), value];
}

/** Parse JSON with comments and trailing commas (wrangler.jsonc). */
export function parseJsonc(text) {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      const start = i;
      for (i++; i < text.length && text[i] !== '"'; i++)
        if (text[i] === '\\') i++;
      out += text.slice(start, i + 1);
    } else if (char === '/' && text[i + 1] === '/') {
      while (i < text.length && text[i] !== '\n') i++;
      out += '\n';
    } else if (char === '/' && text[i + 1] === '*') {
      i = text.indexOf('*/', i + 2) + 1;
      assert.ok(i > 0, 'unterminated block comment');
    } else out += char;
  }
  return JSON.parse(out.replace(/,(\s*[}\]])/g, '$1'));
}

function storageClasses(migrations = []) {
  const classes = new Map();
  for (const migration of migrations) {
    const unknown = Object.keys(migration).filter(
      (key) =>
        ![
          'tag',
          'new_sqlite_classes',
          'new_classes',
          'renamed_classes',
          'deleted_classes',
        ].includes(key)
    );
    assert.deepEqual(unknown, [], 'unsupported Durable Object migration');
    for (const name of migration.new_sqlite_classes ?? [])
      classes.set(name, 'sqlite');
    for (const name of migration.new_classes ?? [])
      classes.set(name, 'legacy-kv');
    for (const { from, to } of migration.renamed_classes ?? []) {
      assert.ok(classes.has(from), `missing source class ${from} in rename`);
      classes.set(to, classes.get(from));
      classes.delete(from);
    }
    for (const name of migration.deleted_classes ?? []) classes.delete(name);
  }
  return sortedObject(classes);
}

function emptyIdentity() {
  return {
    name: undefined,
    accountId: undefined,
    compatibilityDate: undefined,
    compatibilityFlags: [],
    workersDev: undefined,
    previewUrls: undefined,
    sourceMaps: undefined,
    observability: undefined,
    crons: [],
    routes: [],
    vars: {},
    secrets: [],
    durableObjects: {},
    durableObjectClasses: {},
    unmapped: {},
  };
}

function finish(identity) {
  assert.equal(
    typeof identity.previewUrls,
    'boolean',
    'pin preview URL behavior explicitly'
  );
  assert.equal(
    typeof identity.observability?.enabled,
    'boolean',
    'pin observability.enabled'
  );
  assert.equal(
    typeof identity.observability?.headSamplingRate,
    'number',
    'pin observability.headSamplingRate'
  );
  assert.equal(
    typeof identity.observability?.logs?.enabled,
    'boolean',
    'pin observability.logs.enabled'
  );
  assert.equal(
    typeof identity.observability?.logs?.headSamplingRate,
    'number',
    'pin observability.logs.headSamplingRate'
  );
  assert.equal(
    typeof identity.observability?.logs?.invocationLogs,
    'boolean',
    'pin observability.logs.invocationLogs'
  );
  identity.crons.sort();
  identity.secrets.sort();
  identity.routes.sort((left, right) =>
    left.pattern.localeCompare(right.pattern)
  );
  identity.vars = sortedObject(Object.entries(identity.vars));
  identity.durableObjects = sortedObject(
    Object.entries(identity.durableObjects)
  );
  identity.unmapped = sortedObject(Object.entries(identity.unmapped));
  return JSON.parse(JSON.stringify(identity));
}

function route(pattern, zone, customDomain, extra) {
  return { pattern, zone, customDomain: customDomain || undefined, extra };
}

/** Normalize a Wrangler configuration object (wrangler.jsonc contents). */
export function normalizeWranglerConfig(raw) {
  const identity = emptyIdentity();
  for (const [key, value] of Object.entries(raw)) {
    if (WRANGLER_TOOLING_KEYS.has(key)) continue;
    switch (key) {
      case 'name':
        identity.name = value;
        break;
      case 'account_id':
        identity.accountId = value;
        break;
      case 'compatibility_date':
        identity.compatibilityDate = value;
        break;
      case 'compatibility_flags':
        identity.compatibilityFlags = sorted(value);
        break;
      case 'workers_dev':
        identity.workersDev = value;
        break;
      case 'preview_urls':
        identity.previewUrls = value;
        break;
      case 'upload_source_maps':
        identity.sourceMaps = value || undefined;
        break;
      case 'observability':
        identity.observability = canonical(value);
        break;
      case 'triggers':
        identity.crons.push(...(value.crons ?? []));
        addUnmapped(identity, 'triggers', extraKeys(value, new Set(['crons'])));
        break;
      case 'routes':
        for (const item of value) {
          if (typeof item === 'string') {
            identity.routes.push(route(item));
            continue;
          }
          const known = new Set([
            'pattern',
            'custom_domain',
            'zone_name',
            'zone_id',
          ]);
          // Both zone forms at once cannot be expressed by one cf zone.
          const zone = item.zone_name ?? item.zone_id;
          const extra =
            item.zone_name && item.zone_id
              ? { ...extraKeys(item, known), zoneId: item.zone_id }
              : extraKeys(item, known);
          identity.routes.push(
            route(item.pattern, zone, item.custom_domain, extra)
          );
        }
        break;
      case 'vars':
        for (const [name, varValue] of Object.entries(value))
          identity.vars[name] = varValue;
        break;
      case 'secrets':
        identity.secrets.push(...(value.required ?? []));
        addUnmapped(
          identity,
          'secrets',
          extraKeys(value, new Set(['required']))
        );
        break;
      case 'durable_objects':
        addUnmapped(
          identity,
          'durable_objects',
          extraKeys(value, new Set(['bindings']))
        );
        for (const binding of value.bindings ?? [])
          identity.durableObjects[binding.name] = {
            className: binding.class_name,
            scriptName: binding.script_name,
            extra: extraKeys(
              binding,
              new Set(['name', 'class_name', 'script_name'])
            ),
          };
        break;
      case 'migrations':
        identity.durableObjectClasses = storageClasses(value);
        break;
      default:
        identity.unmapped[key] = [canonical(value)];
    }
  }
  return finish(identity);
}

function cfBinding(identity, workerName, name, binding) {
  switch (binding.type) {
    case 'text':
    case 'json':
      identity.vars[name] = binding.value;
      addUnmapped(
        identity,
        `env.${name}`,
        extraKeys(binding, new Set(['type', 'value']))
      );
      return;
    case 'secret':
      identity.secrets.push(name);
      addUnmapped(
        identity,
        `env.${name}`,
        extraKeys(binding, new Set(['type']))
      );
      return;
    case 'durable-object':
      identity.durableObjects[name] = {
        className: binding.exportName,
        scriptName:
          binding.worker && binding.worker !== workerName
            ? binding.worker
            : undefined,
        extra: extraKeys(binding, new Set(['type', 'exportName', 'worker'])),
      };
      return;
    default:
      addUnmapped(identity, `env.${name}`, canonical(binding));
  }
}

function cfExports(identity, value) {
  const live = new Map();
  const renamed = [];
  for (const [name, entry] of Object.entries(value)) {
    const state = entry.state ?? 'created';
    const known = new Set(['type', 'storage', 'state', 'renamedTo']);
    if (
      entry.type !== 'durable-object' ||
      !['created', 'deleted', 'renamed'].includes(state)
    ) {
      // Transfers, containers and non-DO exports need explicit review.
      addUnmapped(identity, `exports.${name}`, canonical(entry));
      continue;
    }
    addUnmapped(identity, `exports.${name}`, extraKeys(entry, known));
    if (state === 'created') live.set(name, entry.storage);
    if (state === 'renamed') renamed.push([name, entry.renamedTo]);
  }
  // A rename must land on a live class, as a Wrangler renamed_classes step does.
  for (const [from, to] of renamed)
    if (!live.has(to))
      addUnmapped(identity, `exports.${from}`, { renamedTo: to });
  identity.durableObjectClasses = sortedObject(live);
}

/**
 * Normalize a cf configuration: either the object exported by
 * cloudflare.config.ts, or `{ ...rootConfig, worker }` read from the Build
 * Output Specification (including its bundle `manifest`).
 */
export function normalizeCfConfig(config) {
  const identity = emptyIdentity();
  const { accountId, buildContext: _buildContext, worker, ...rest } = config;
  identity.accountId = accountId;
  for (const [key, value] of Object.entries(rest))
    identity.unmapped[key] = [canonical(value)];
  for (const [key, value] of Object.entries(worker)) {
    if (CF_TOOLING_KEYS.has(key)) continue;
    switch (key) {
      case 'name':
        identity.name = value;
        break;
      case 'compatibilityDate':
        identity.compatibilityDate = value;
        break;
      case 'compatibilityFlags':
        identity.compatibilityFlags = sorted(value);
        break;
      case 'workersDev':
        identity.workersDev = value;
        break;
      case 'previewUrls':
        identity.previewUrls = value;
        break;
      case 'manifest':
        // Uploaded source maps change the artifact; Wrangler only did so on opt-in.
        if (
          Object.values(value.modules ?? {}).some(
            (module) => module.type === 'sourcemap'
          )
        )
          identity.sourceMaps = true;
        break;
      case 'observability':
        identity.observability = canonical(value);
        break;
      case 'triggers':
        for (const trigger of value) {
          if (trigger.type === 'scheduled') {
            identity.crons.push(trigger.schedule);
            addUnmapped(
              identity,
              'triggers',
              extraKeys(trigger, new Set(['type', 'schedule']))
            );
          } else if (trigger.type === 'fetch')
            identity.routes.push(
              route(
                trigger.pattern,
                trigger.zone,
                undefined,
                extraKeys(trigger, new Set(['type', 'pattern', 'zone']))
              )
            );
          else
            addUnmapped(
              identity,
              `triggers.${trigger.type}`,
              canonical(trigger)
            );
        }
        break;
      case 'domains':
        for (const domain of value)
          identity.routes.push(
            typeof domain === 'string'
              ? route(domain, undefined, true)
              : route(
                  domain.hostname,
                  domain.zone,
                  true,
                  extraKeys(domain, new Set(['hostname', 'zone']))
                )
          );
        break;
      case 'env':
        for (const [name, binding] of Object.entries(value))
          cfBinding(identity, worker.name, name, binding);
        break;
      case 'exports':
        cfExports(identity, value);
        break;
      default:
        identity.unmapped[key] = [canonical(value)];
    }
  }
  return finish(identity);
}

function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** Read the default Worker of an emitted Build Output tree, rejecting escapes. */
export function readBuildOutputConfig(appDir) {
  const root = realpathSync(resolve(appDir));
  const output = join(root, '.cloudflare', 'output', 'v0');
  assert.deepEqual(
    readdirSync(join(output, 'workers')).sort(),
    ['default'],
    'Build Output must contain only the default Worker'
  );
  const workerConfigPath = join(
    output,
    'workers',
    'default',
    'worker.config.json'
  );
  for (const file of [join(output, 'config.json'), workerConfigPath]) {
    const real = realpathSync(file);
    assert.ok(real.startsWith(root + sep), `${file} escapes ${root}`);
    assert.ok(statSync(real).isFile(), `${file} is not a regular file`);
  }
  const rootConfig = readJson(join(output, 'config.json'));
  const worker = readJson(workerConfigPath);
  assert.equal(worker.manifest?.type, 'complete', 'complete bundle manifest');
  assert.ok(worker.manifest.mainModule, 'emitted main module');
  return { ...rootConfig, worker, buildContext: rootConfig.buildContext };
}

export function assertBuildOutputParity(appDir, baselinePath, accountId) {
  const baseline = readJson(baselinePath);
  const emitted = readBuildOutputConfig(appDir);
  if (accountId !== undefined) {
    assert.ok(accountId.trim(), 'CLOUDFLARE_ACCOUNT_ID is required');
    assert.equal(
      emitted.accountId,
      accountId,
      'deployment account must match emitted accountId'
    );
  }
  assert.equal(emitted.buildContext?.mode, 'production', 'production build');
  assert.equal(emitted.buildContext?.isPreview, false, 'non-preview build');
  assert.deepEqual(normalizeCfConfig(emitted), baseline.identity);
  return baseline.identity;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [appDir, baselinePath, accountId] = process.argv.slice(2);
  assert.ok(appDir && baselinePath, 'usage: <app-dir> <baseline.json>');
  const identity = assertBuildOutputParity(appDir, baselinePath, accountId);
  console.log(
    `${relative(REPO_ROOT, resolve(appDir))}: emitted Build Output matches ` +
      `${identity.name} deployment identity`
  );
}
