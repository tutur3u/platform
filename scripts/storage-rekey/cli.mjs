#!/usr/bin/env node
// Operator CLI for re-keying leaked private-root objects in the `workspaces`
// bucket. Runbook: apps/docs/build/devops/storage-signed-url-rekey.mdx.
//
//   node scripts/storage-rekey/cli.mjs --project-ref <ref> --environment <env> \
//     --ledger <file> --root <chats|mira/images|.tuturuuu> [--dry-run]
//   ... --execute --approve-token <one-time value>
//   ... --rollback --approve-token <one-time value>
//   ... --issue-token   (fresh one-time token for the current pending set)
//   ... --status
//
// Secrets: SUPABASE_ACCESS_TOKEN_FILE must name a mode-600 file. The
// service-role key is fetched into memory and never persisted.

import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { createEngine, MAX_BATCH_SIZE } from './engine.mjs';
import {
  acquireLock,
  consumeApproval,
  countByState,
  issueApproval,
  loadLedger,
  mergeSelection,
  rowsForRoot,
  saveLedger,
} from './ledger.mjs';
import { ROOTS } from './roots.mjs';
import { createStopFence } from './stop-fence.mjs';
import {
  createSqlClient,
  createStorageClient,
  fetchServiceRoleKey,
  readSecretFile,
} from './supabase.mjs';

const BUCKET = 'workspaces';
const ENVIRONMENTS = new Set(['staging', 'production']);

export function parseCli(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      'project-ref': { type: 'string' },
      environment: { type: 'string' },
      ledger: { type: 'string' },
      root: { type: 'string' },
      'dry-run': { type: 'boolean' },
      execute: { type: 'boolean' },
      rollback: { type: 'boolean' },
      status: { type: 'boolean' },
      'issue-token': { type: 'boolean' },
      'references-confirmed': { type: 'boolean' },
      'ws-id': { type: 'string' },
      'approve-token': { type: 'string' },
      'stop-file': { type: 'string' },
      'batch-size': { type: 'string', default: String(MAX_BATCH_SIZE) },
      'max-ops': { type: 'string', default: '500' },
      'probe-every': { type: 'string', default: '0' },
    },
    strict: true,
  });
  const modes = ['execute', 'rollback', 'status', 'issue-token'].filter((mode) => values[mode]);
  if (values['dry-run'] && modes.length) throw new Error('--dry-run cannot be combined with other modes');
  if (modes.length > 1) throw new Error('Choose one of --execute, --rollback, --issue-token, --status');
  const mode = modes[0] ?? 'dry-run';
  for (const required of ['project-ref', 'environment', 'ledger']) {
    if (!values[required]) throw new Error(`--${required} is required`);
  }
  if (!/^[a-z0-9]{20}$/.test(values['project-ref'])) throw new Error('--project-ref looks invalid');
  if (!ENVIRONMENTS.has(values.environment)) throw new Error('--environment must be staging or production');
  if (mode !== 'status' && !ROOTS[values.root]) {
    throw new Error(`--root is required: ${Object.keys(ROOTS).join(', ')}`);
  }
  if ((mode === 'execute' || mode === 'rollback') && !values['approve-token']) {
    throw new Error(`--${mode} requires --approve-token`);
  }
  if (mode === 'execute' && ROOTS[values.root].requiresReferenceConfirmation && !values['references-confirmed']) {
    throw new Error(`--root ${values.root} requires --references-confirmed after the reference review`);
  }
  if (values['ws-id'] && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(values['ws-id'])) {
    throw new Error('--ws-id must be a workspace uuid');
  }
  const batchSize = Number(values['batch-size']);
  const maxOps = Number(values['max-ops']);
  const probeEvery = Number(values['probe-every']);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > MAX_BATCH_SIZE) {
    throw new Error(`--batch-size must be 1..${MAX_BATCH_SIZE}`);
  }
  if (!Number.isInteger(maxOps) || maxOps < 1 || maxOps > 5000) throw new Error('--max-ops must be 1..5000');
  if (!Number.isInteger(probeEvery) || probeEvery < 0) throw new Error('--probe-every must be >= 0');
  if (probeEvery > 0 && values.environment !== 'staging') {
    // Minting signed URLs for private objects is a staging-only test aid.
    throw new Error('--probe-every is allowed only with --environment staging');
  }
  return {
    mode,
    projectRef: values['project-ref'],
    environment: values.environment,
    ledgerFile: values.ledger,
    root: values.root,
    wsId: values['ws-id'] ?? null,
    approveToken: values['approve-token'],
    stopFile: values['stop-file'] ?? `${values.ledger}.STOP`,
    batchSize,
    maxOps,
    probeEvery,
  };
}

function log(event, fields) {
  console.log(JSON.stringify({ event, ...fields }));
}

function tokenFile(options) {
  return `${options.ledgerFile}.${options.root.replaceAll(/[^a-z0-9]+/gi, '_')}.approve-token`;
}

function writeTokenFile(options, token) {
  fs.writeFileSync(tokenFile(options), `${token}\n`, { mode: 0o600 });
  fs.chmodSync(tokenFile(options), 0o600);
}

function summary(ledger, root) {
  const rows = rowsForRoot(ledger, root);
  return {
    root,
    counts: countByState(rows),
    skipped: rows.filter((e) => e.state === 'skipped').map((e) => ({ id: e.id, reason: e.skipReason })),
    failed: rows.filter((e) => e.state === 'failed').map((e) => ({ id: e.id, code: e.errorCode })),
  };
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const options = parseCli(argv);
  const scope = { projectRef: options.projectRef, environment: options.environment, bucket: BUCKET };
  const release = acquireLock(options.ledgerFile);
  try {
    const ledger = loadLedger(options.ledgerFile, scope);
    const save = () => saveLedger(options.ledgerFile, ledger);
    if (options.mode === 'status') {
      const roots = options.root ? [options.root] : Object.keys(ROOTS);
      for (const root of roots) log('status', summary(ledger, root));
      return 0;
    }
    if (options.mode === 'issue-token') {
      // Re-approval for a resume or rollback without re-running selection.
      const token = issueApproval(ledger, options.root, { now: new Date().toISOString() });
      save();
      writeTokenFile(options, token);
      log('issue_token', { ...summary(ledger, options.root), approvalTokenFile: tokenFile(options) });
      return 0;
    }
    const fence = createStopFence({ stopFile: options.stopFile, maxOps: options.maxOps });
    fence.check();
    const accessToken = readSecretFile(env.SUPABASE_ACCESS_TOKEN_FILE);
    const sql = createSqlClient({ projectRef: options.projectRef, accessToken });
    const root = ROOTS[options.root];
    const now = () => new Date().toISOString();

    if (options.mode === 'dry-run') {
      // Read-only selection; the only write is to the local ledger.
      fence.beforeOperation();
      const rows = (await sql.read(root.selectionSql({ bucket: BUCKET, wsId: options.wsId }))).map(root.toSelection);
      const added = mergeSelection(ledger, rows, { now: now() });
      const token = issueApproval(ledger, options.root, { now: now() });
      save();
      writeTokenFile(options, token);
      log('dry_run', { ...summary(ledger, options.root), added, approvalTokenFile: tokenFile(options) });
      return 0;
    }

    consumeApproval(ledger, options.root, options.approveToken, { now: now() });
    save();
    const serviceKey = await fetchServiceRoleKey({ projectRef: options.projectRef, accessToken });
    const storage = createStorageClient({ projectRef: options.projectRef, serviceKey, bucket: BUCKET });
    const engine = createEngine({ ledger, save, sql, storage, fence, roots: ROOTS, log, now });
    const result =
      options.mode === 'execute'
        ? await engine.run({ root: options.root, batchSize: options.batchSize, probeEvery: options.probeEvery })
        : await engine.rollback({ root: options.root });
    log(options.mode, { root: options.root, ...result });
    return result.stopped ? 3 : 0;
  } finally {
    release();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      // Codes only: upstream messages can embed object names.
      console.error(JSON.stringify({ event: 'error', code: error?.code ?? error?.name ?? 'unexpected', message: error?.code ? undefined : error?.message }));
      process.exit(1);
    }
  );
}
