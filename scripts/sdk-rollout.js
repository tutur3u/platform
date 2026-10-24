#!/usr/bin/env node
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const artifact = require('./sdk-rollout-artifact');
const engine = require('./sdk-rollout-engine');
const { parseArgs, candidate, run, quote } = artifact;
const { worker, rollback } = engine;
function preserveStaging(report) {
  return (
    report.status === 'unknown' ||
    ['failed', 'blocked-active-child'].includes(report.rollback)
  );
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
        'Every attempt saves a private backup and rollback.sh under ~/.tuturuuu/resources/backups/. Stop fleet rollout on the first failed or unknown host.',
    };
  if (args[0] === '--worker')
    return worker(JSON.parse(Buffer.from(args[1], 'base64url').toString()));
  if (args[0] === '--rollback') return rollback(path.resolve(args[1]));
  const options = parseArgs(args);
  const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'ttr-rollout-'));
  fs.chmodSync(stage, 0o700);
  const reports = [];
  let retainStage = false;
  try {
    const resolved = await prepare(options, stage);
    for (const host of options.hosts.length ? options.hosts : [null]) {
      let report;
      if (host) {
        let remote;
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
          ])
            await invoke('scp', [
              '-q',
              '--',
              path.join(__dirname, name),
              `${host}:${remote}/${name}`,
            ]);
          const payload = Buffer.from(
            JSON.stringify({ ...resolved, tarball: `${remote}/candidate.tgz` })
          ).toString('base64url');
          report = validateWorkerReport(
            JSON.parse(
              await invoke('ssh', [
                '-o',
                'BatchMode=yes',
                host,
                `"$HOME/.bun/bin/bun" ${quote(`${remote}/sdk-rollout.js`)} --worker ${quote(payload)}`,
              ])
            )
          );
        } catch (error) {
          report = {
            status: 'unknown',
            error: error.message,
            recovery: remote ? `${remote}/sdk-rollout.js` : null,
          };
        }
        // Keep staging when outcome is unknown; never replay an uncertain install.
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
        } else if (remote) report.staging = remote;
      } else report = await runWorker(resolved);
      retainStage ||= preserveStaging(report);
      reports.push({ host: host || 'local', ...report });
      if (report.status !== 'qualified') break;
    }
  } finally {
    if (!retainStage) fs.rmSync(stage, { recursive: true, force: true });
  }
  return {
    schemaVersion: 1,
    status: reports.every((report) => report.status === 'qualified')
      ? 'qualified'
      : 'failed',
    reports,
    ...(retainStage ? { staging: stage } : {}),
  };
}
module.exports = {
  ...artifact,
  ...engine,
  main,
  preserveStaging,
  validateWorkerReport,
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
