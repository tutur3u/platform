#!/usr/bin/env node
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const artifact = require('./sdk-rollout-artifact');
const engine = require('./sdk-rollout-engine');
const { parseArgs, candidate, run, quote, atomicJson } = artifact;
const { worker, rollback } = engine;
const operationBudgetMs = 30 * 60 * 1000;
function remoteTimeoutMs(waitDrain = 0) {
  return waitDrain * 1000 + operationBudgetMs;
}
function preserveStaging(report) {
  return (
    report.status === 'unknown' ||
    ['failed', 'blocked-active-child'].includes(report.rollback)
  );
}
function qualified(report) {
  return report.status === 'qualified' && report.rollback === 'not-needed';
}
function validateWorkerReport(report) {
  if (
    report?.schemaVersion !== 1 ||
    !['qualified', 'failed'].includes(report.status) ||
    !['not-needed', 'restored', 'failed', 'blocked-active-child'].includes(
      report.rollback
    ) ||
    (report.backup !== null && typeof report.backup !== 'string')
  )
    throw new Error('Invalid remote worker report; outcome unknown');
  if (report.status === 'qualified' && report.rollback !== 'not-needed')
    return {
      ...report,
      status: 'failed',
      error:
        report.error ||
        'Qualification cannot succeed with rollback activity or failure',
    };
  return report;
}
function completionReceipt(payload, report) {
  return {
    schemaVersion: 1,
    operationId: payload.operationId,
    version: payload.version,
    sha256: payload.sha256,
    complete: true,
    report,
  };
}
function readCompletion(text, payload) {
  const receipt = JSON.parse(text);
  if (
    receipt?.schemaVersion !== 1 ||
    receipt.complete !== true ||
    receipt.operationId !== payload.operationId ||
    receipt.version !== payload.version ||
    receipt.sha256 !== payload.sha256
  )
    throw new Error('Remote completion receipt does not match this rollout');
  return validateWorkerReport(receipt.report);
}
async function workerRequest(payload, execute = worker, directory = __dirname) {
  if (!/^[a-f0-9]{32}$/.test(payload.operationId || ''))
    throw new Error('Invalid rollout operation identity');
  const report = validateWorkerReport(await execute(payload));
  atomicJson(
    path.join(directory, 'worker-report.json'),
    completionReceipt(payload, report)
  );
  return report;
}
async function remoteWorker(host, resolved, options, invoke) {
  let remote;
  let payload;
  let report;
  try {
    remote = (
      await invoke('ssh', [
        '-o',
        'BatchMode=yes',
        host,
        'umask 077; mktemp -d /tmp/ttr-rollout.XXXXXXXXXX',
      ])
    ).trim();
    if (!/^\/tmp\/ttr-rollout\.[A-Za-z0-9]{10}$/.test(remote))
      throw new Error('Unexpected remote staging path');
    await invoke('scp', [
      '-q',
      '--',
      resolved.tarball,
      `${host}:${remote}/candidate.tgz`,
    ]);
    for (const name of [
      'sdk-rollout.js',
      'sdk-rollout-artifact.js',
      'sdk-rollout-engine.js',
      'sdk-rollout-state.js',
    ])
      await invoke('scp', [
        '-q',
        '--',
        path.join(__dirname, name),
        `${host}:${remote}/${name}`,
      ]);
    payload = {
      ...resolved,
      tarball: `${remote}/candidate.tgz`,
      operationId: crypto.randomBytes(16).toString('hex'),
    };
    const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
    report = validateWorkerReport(
      JSON.parse(
        await invoke(
          'ssh',
          [
            '-o',
            'BatchMode=yes',
            host,
            `"$HOME/.bun/bin/bun" ${quote(`${remote}/sdk-rollout.js`)} --worker ${quote(encoded)}`,
          ],
          { timeoutMs: remoteTimeoutMs(options.waitDrain) }
        )
      )
    );
  } catch (error) {
    // A transport failure is never an instruction to replay installation. Only a
    // matching, terminal receipt can turn its unknown outcome into a known one.
    let reconciliationError;
    if (remote && payload) {
      try {
        report = readCompletion(
          await invoke(
            'ssh',
            [
              '-o',
              'BatchMode=yes',
              host,
              `cat -- ${quote(`${remote}/worker-report.json`)}`,
            ],
            { timeoutMs: 10_000 }
          ),
          payload
        );
        report.transportError = error.message;
        report.reconciled = true;
      } catch (failure) {
        reconciliationError = failure.message;
      }
    }
    report ??= {
      status: 'unknown',
      error: error.message,
      recovery: remote ? `${remote}/sdk-rollout.js` : null,
      ...(reconciliationError ? { reconciliationError } : {}),
    };
  }
  if (remote && !preserveStaging(report)) {
    try {
      await invoke('ssh', [
        '-o',
        'BatchMode=yes',
        host,
        `rm -rf -- ${quote(remote)}`,
      ]);
    } catch (error) {
      report.cleanupError = error.message;
      report.staging = remote;
    }
  } else if (remote) {
    report.staging = remote;
    report.reportFile = `${remote}/worker-report.json`;
  }
  return report;
}
async function main(args, dependencies = {}) {
  const invoke = dependencies.run || run;
  const prepare = dependencies.candidate || candidate;
  const runWorker = dependencies.worker || worker;
  if (args.length === 1 && ['--help', '-h'].includes(args[0]))
    return {
      status: 'help',
      usage:
        'node scripts/sdk-rollout.js --channel dev|latest [--host SSH_ALIAS] [--wait-drain SECONDS] | --tarball PATH_OR_HTTPS_URL --sha256 HASH [--host SSH_ALIAS]',
      recovery:
        'Keep the private backup and rollback.sh under ~/.tuturuuu/resources/backups/. Remote timeout includes drain plus a 30-minute operation budget; unknown outcomes retain the remote completion report path.',
    };
  if (args[0] === '--worker')
    return workerRequest(
      JSON.parse(Buffer.from(args[1], 'base64url').toString())
    );
  if (args[0] === '--rollback') return rollback(path.resolve(args[1]));
  const options = parseArgs(args);
  const hosts = options.hosts.length ? options.hosts : [null];
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'ttr-rollout-'));
  fs.chmodSync(stage, 0o700);
  const reports = [];
  let retainStage = false;
  let preparationError;
  let cleanupError;
  try {
    let resolved;
    try {
      resolved = await prepare(options, stage);
    } catch (error) {
      preparationError = error.message;
    }
    let blockedBy = preparationError ? 'candidate-verification' : null;
    for (const host of hosts) {
      if (blockedBy) {
        reports.push({
          host: host || 'local',
          status: 'skipped',
          reason: 'not-attempted',
          blockedBy,
        });
        continue;
      }
      let report;
      if (host) report = await remoteWorker(host, resolved, options, invoke);
      else {
        try {
          report = validateWorkerReport(await runWorker(resolved));
        } catch (error) {
          report = { status: 'unknown', error: error.message };
        }
      }
      retainStage ||= preserveStaging(report);
      reports.push({ host: host || 'local', ...report });
      if (!qualified(report)) blockedBy = host || 'local';
    }
  } finally {
    if (!retainStage) {
      try {
        fs.rmSync(stage, { recursive: true, force: true });
      } catch (error) {
        cleanupError = error.message;
      }
    }
  }
  return {
    schemaVersion: 1,
    status:
      reports.length > 0 && reports.every(qualified) ? 'qualified' : 'failed',
    reports,
    ...(preparationError ? { error: preparationError } : {}),
    ...(cleanupError ? { cleanupError, staging: stage } : {}),
    ...(retainStage ? { staging: stage } : {}),
  };
}
module.exports = {
  ...artifact,
  ...engine,
  main,
  preserveStaging,
  qualified,
  validateWorkerReport,
  operationBudgetMs,
  remoteTimeoutMs,
  completionReceipt,
  readCompletion,
  workerRequest,
};
if (require.main === module) {
  main(process.argv.slice(2)).then(
    (report) => {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      if (
        process.argv[2] !== '--worker' &&
        !['qualified', 'restored', 'help'].includes(report.status)
      )
        process.exitCode = 1;
    },
    (error) => {
      process.stdout.write(
        `${JSON.stringify({ schemaVersion: 1, status: 'failed', error: error.message })}\n`
      );
      process.exitCode = 1;
    }
  );
}
