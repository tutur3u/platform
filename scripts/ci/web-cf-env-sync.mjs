#!/usr/bin/env node
// Copies the production environment of the Vercel `platform` project onto one
// apps/web Cloudflare Worker.
//
//   node scripts/ci/web-cf-env-sync.mjs --worker <name> --names <list> \
//     [--names <list> ...] [--apply] [--report <path>] [--vars-out <path>]
//     [--deny <NAME> ...]
//
// A name list is a family inventory (apps/web/cloudflare/opennext/*.env.json)
// or a plain list; see web-cf-env-sync-names.mjs. Without --apply nothing is
// revealed or written: the run prints the plan. With --apply every value is
// revealed one at a time from the Vercel REST API, held in memory, and written
// only after all reveals succeed: NEXT_PUBLIC_* names as plain-text vars, the
// rest as secrets in one version. Sensitive Vercel values cannot be revealed,
// so they are reported as missing. Output names variables, types and
// destinations, never a value.
//
// Credentials, by name: VERCEL_TOKEN (else the Vercel CLI login) and
// CLOUDFLARE_API_TOKEN (else the `cf` CLI login). The `cf` CLI cannot set
// plain-text vars, so without a token --vars-out receives them (mode 0600)
// for the Worker's deploy config.
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { globToRegExp, readNameLists } from './web-cf-env-sync-names.mjs';
import * as providers from './web-cf-env-sync-providers.mjs';
import { readBack } from './shared-secret-api.mjs';

// The Vercel `platform` project this tool reads from (an id, not a secret).
const VERCEL_PROJECT_ID = 'prj_RlDllxkTSo5mjpzycCRQY4tGONYu';
const WORKER_NAME = /^tuturuuu-[a-z0-9][a-z0-9-]{0,62}$/;
// Cloudflare limits a secret or plain-text binding to 5 KiB.
const MAX_VALUE_BYTES = 5 * 1024;

export const isPublicName = (name) => name.startsWith('NEXT_PUBLIC_');

/**
 * Names never copied to a Worker and left out of every report line, whatever
 * a list or Vercel says. Each entry names a retired integration whose Vercel
 * value is pending deletion. `--deny NAME` adds to it for one run.
 */
export const DENIED_NAMES = Object.freeze([
  // The Deepgram integration is removed from the codebase.
  'DEEPGRAM_API_KEY',
]);

export function parseArgs(argv) {
  const options = {
    names: [],
    apply: false,
    worker: null,
    report: null,
    varsOut: null,
    deny: [...DENIED_NAMES],
  };
  for (let index = 0; index < argv.length; index++) {
    const flag = argv[index];
    if (flag === '--apply') options.apply = true;
    else if (flag === '--worker') options.worker = argv[++index];
    else if (flag === '--names') options.names.push(argv[++index]);
    else if (flag === '--report') options.report = argv[++index];
    else if (flag === '--vars-out') options.varsOut = argv[++index];
    else if (flag === '--deny') options.deny.push(argv[++index]);
    else throw new assert.AssertionError({ message: `unknown flag ${flag}` });
  }
  assert.ok(
    typeof options.worker === 'string' && WORKER_NAME.test(options.worker),
    '--worker must name a tuturuuu-* Worker'
  );
  assert.ok(
    options.names.every((path) => typeof path === 'string' && path),
    '--names needs a path'
  );
  assert.ok(
    options.deny.every((name) => /^[A-Z][A-Z0-9_]*$/.test(name ?? '')),
    '--deny needs an upper-case variable name'
  );
  return options;
}

/**
 * Merges project and shared entries. A project entry shadows a shared entry
 * with the same key, matching Vercel's own precedence.
 */
export function mergeVercelEntries(project, shared) {
  const byKey = new Map();
  for (const entry of shared) byKey.set(entry.key, entry);
  for (const entry of project) {
    const previous = byKey.get(entry.key);
    byKey.set(entry.key, previous ? { ...entry, shadows: 'shared' } : entry);
  }
  return byKey;
}

/**
 * The plan: one row per name with its Vercel source and type, destination
 * (`var`, `secret` or `none`) and status. `bindings` is the Worker's current
 * binding list or null when the Worker does not exist yet.
 */
export function planSync({
  lists,
  vercel: allEntries,
  bindings,
  deny = DENIED_NAMES,
}) {
  const denied = new Set(deny);
  const vercel = new Map([...allEntries].filter(([key]) => !denied.has(key)));
  const rows = new Map();
  const unmatched = [];
  const bound = new Map((bindings ?? []).map((item) => [item.name, item.type]));
  const add = (name, section) => {
    if (rows.has(name) || denied.has(name)) return;
    const entry = vercel.get(name);
    const row = {
      name,
      section,
      source: entry?.source ?? null,
      type: entry?.type ?? null,
      destination: isPublicName(name) ? 'var' : 'secret',
      status: 'write',
    };
    const current = bound.get(name);
    if (lists.excluded.has(name)) row.status = 'skip: listed as unset';
    else if (!entry)
      row.status =
        current === 'plain_text'
          ? 'kept: bound as plain_text by the deploy config'
          : 'absent: not set in Vercel production';
    else if (entry.type === 'sensitive')
      row.status = 'missing: sensitive in Vercel (not readable)';
    else if (entry.type === 'system') row.status = 'skip: Vercel system value';
    else if (row.destination === 'secret' && current === 'plain_text')
      row.status = 'skip: bound as plain_text by the deploy config';
    else if (row.destination === 'var' && current && current !== 'plain_text')
      row.status = `conflict: bound as ${current}`;
    else if (
      row.destination === 'secret' &&
      current &&
      current !== 'secret_text'
    )
      row.status = `conflict: bound as ${current}`;
    if (row.status !== 'write') row.destination = 'none';
    rows.set(name, row);
  };
  for (const { pattern, section } of lists.patterns) {
    if (!pattern.includes('*')) {
      add(pattern, section);
      continue;
    }
    const regexp = globToRegExp(pattern);
    const matches = [...vercel.keys()].filter((key) => regexp.test(key));
    if (matches.length === 0) unmatched.push(pattern);
    for (const key of matches.sort()) add(key, section);
  }
  return {
    rows: [...rows.values()].sort((a, b) => a.name.localeCompare(b.name)),
    unmatched,
    unlisted: [...vercel.keys()].filter((key) => !rows.has(key)).sort(),
  };
}

export function formatPlan({
  worker,
  rows,
  unmatched,
  unlisted = [],
  workerExists,
}) {
  const lines = [
    `worker ${worker}${workerExists ? '' : ' (absent: publish it before --apply)'}`,
  ];
  for (const row of rows)
    lines.push(
      `  ${row.name}  ${row.type ?? '-'}/${row.source ?? '-'} -> ${row.destination}  ${row.status}`
    );
  for (const pattern of unmatched)
    lines.push(`  ${pattern}  no Vercel production key matches`);
  if (unlisted.length > 0)
    lines.push(`  not in any list (left alone): ${unlisted.join(', ')}`);
  const count = (pattern) =>
    rows.filter((row) => pattern.test(row.status)).length;
  const missing = rows.filter((row) => row.status.startsWith('missing'));
  lines.push(
    `summary: ${count(/^write$/)} to write (${rows.filter((row) => row.destination === 'var').length} vars, ${rows.filter((row) => row.destination === 'secret').length} secrets), ${missing.length} missing, ${count(/^absent/)} absent, ${count(/^kept/)} kept, ${count(/^(skip|conflict)/)} skipped`
  );
  if (missing.length > 0)
    lines.push(`missing: ${missing.map((row) => row.name).join(', ')}`);
  return lines.join('\n');
}

/** Reveals every planned value before any write; fails closed. */
export async function revealPlanned({ rows, vercel, reveal }) {
  const vars = {};
  const secrets = {};
  const empty = [];
  for (const row of rows.filter((item) => item.status === 'write')) {
    const value = await reveal(vercel.get(row.name));
    if (typeof value !== 'string' || value.length === 0) {
      row.status = 'missing: empty reveal';
      row.destination = 'none';
      empty.push(row.name);
      continue;
    }
    assert.ok(
      Buffer.byteLength(value) <= MAX_VALUE_BYTES,
      `${row.name} exceeds the 5 KiB Worker binding limit`
    );
    (row.destination === 'var' ? vars : secrets)[row.name] = value;
  }
  return { vars, secrets, empty };
}

/** Name-and-type readback; plain-text values are compared, never printed. */
export function verifyWritten({ bindings, vars, secrets }) {
  const byName = new Map(bindings.map((item) => [item.name, item]));
  const problems = [];
  for (const [name, text] of Object.entries(vars)) {
    const binding = byName.get(name);
    if (binding?.type !== 'plain_text' || binding.text !== text)
      problems.push(`${name} (var)`);
  }
  for (const name of Object.keys(secrets))
    if (byName.get(name)?.type !== 'secret_text')
      problems.push(`${name} (secret)`);
  assert.equal(
    problems.length,
    0,
    `readback mismatch for ${problems.join(', ')}`
  );
}

export async function run(options, deps) {
  const {
    env = process.env,
    fetchImpl = fetch,
    log = console.log,
    readList,
    api = providers,
    cloudflare = api.cloudflareClient({ env, fetchImpl }),
    writeFile = writeFileSync,
  } = deps ?? {};
  const lists = readNameLists(options.names, readList);
  const vercelToken = api.resolveVercelToken({ env });
  const projectId = VERCEL_PROJECT_ID;
  const vercel = mergeVercelEntries(
    await api.listProjectEnv({ token: vercelToken, projectId, fetchImpl }),
    await api.listSharedEnv({ token: vercelToken, projectId, fetchImpl })
  );
  const bindings = await cloudflare.readBindings(options.worker);
  const plan = planSync({ lists, vercel, bindings, deny: options.deny });
  const report = () => {
    log(
      formatPlan({
        worker: options.worker,
        ...plan,
        workerExists: bindings !== null,
      })
    );
    if (options.report)
      writeFile(
        options.report,
        `${JSON.stringify({ worker: options.worker, ...plan }, null, 2)}\n`,
        { mode: 0o600 }
      );
  };
  if (!options.apply) {
    report();
    log(
      `dry run via ${cloudflare.transport}: nothing revealed or written (pass --apply)`
    );
    return plan;
  }
  assert.ok(bindings, `Worker ${options.worker} does not exist`);
  const wantsVars = plan.rows.some((row) => row.destination === 'var');
  assert.ok(
    !wantsVars || cloudflare.patchVars || options.varsOut,
    'the cf CLI cannot set plain-text vars: pass --vars-out <file> or set CLOUDFLARE_API_TOKEN'
  );
  const { vars, secrets } = await revealPlanned({
    rows: plan.rows,
    vercel,
    reveal: (entry) =>
      api.revealValue({ token: vercelToken, projectId, entry, fetchImpl }),
  });
  const workerVars = cloudflare.patchVars ? vars : {};
  if (Object.keys(workerVars).length > 0)
    await cloudflare.patchVars({
      worker: options.worker,
      current: bindings,
      vars: workerVars,
    });
  if (!cloudflare.patchVars && Object.keys(vars).length > 0)
    writeFile(options.varsOut, `${JSON.stringify(vars, null, 2)}\n`, {
      mode: 0o600,
    });
  if (Object.keys(secrets).length > 0)
    await cloudflare.patchSecrets({ worker: options.worker, secrets });
  await readBack(
    () => cloudflare.readBindings(options.worker),
    (current) =>
      verifyWritten({ bindings: current ?? [], vars: workerVars, secrets }),
    deps?.retry ?? { attempts: 4, delayMs: 3000 }
  );
  report();
  log(
    `applied via ${cloudflare.transport}: ${Object.keys(workerVars).length} vars, ${Object.keys(secrets).length} secrets on ${options.worker}` +
      (Object.keys(workerVars).length < Object.keys(vars).length
        ? `; ${Object.keys(vars).length} vars written to --vars-out for the deploy config`
        : '')
  );
  log(
    'Plain-text vars are replaced by the next deploy unless its config declares them; secrets persist across deploys.'
  );
  return plan;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    await run(parseArgs(process.argv.slice(2)));
  } catch (error) {
    // Assertion messages are composed from trusted values; anything else may
    // quote provider data, so only its class name is reported.
    const detail =
      error instanceof assert.AssertionError
        ? error.message
        : `unexpected ${/^[A-Za-z]{1,40}$/.test(error?.name) ? error.name : 'error'}`;
    console.error(`web-cf-env-sync failed: ${detail}`);
    process.exitCode = 1;
  }
}
