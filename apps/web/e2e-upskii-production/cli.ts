#!/usr/bin/env bun
/**
 * CLI for the Upskii production E2E workflow:
 *   bun apps/web/e2e-upskii-production/cli.ts preflight # read-only ttr check
 *   bun apps/web/e2e-upskii-production/cli.ts sweep     # before tests, daily
 *   bun apps/web/e2e-upskii-production/cli.ts cleanup   # always, after tests
 *   bun apps/web/e2e-upskii-production/cli.ts verify    # fails on any leak
 * It prints only keys, kinds and status codes; never cookies or tokens.
 */
import { appendFileSync } from 'node:fs';
import { forgetActors } from './actors';
import { cleanup, type CleanupDeps, sweep, verify } from './cleanup';
import { Ledger } from './ledger';
import { QA_PURPOSE, readRunConfig, required } from './policy';
import {
  formatPreflightSummary,
  parsePreflightArgs,
  runUpskiiPreflight,
} from './preflight';
import { githubOidcAuth, tuturuuuQaClient } from './tuturuuu-qa';
import { upskiiProvisioner } from './upskii';

function summary(lines: string[]) {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) appendFileSync(file, `${lines.join('\n')}\n`);
  for (const line of lines) console.log(line);
}

function fail(title: string, lines: string[]) {
  for (const line of lines) console.log(`::error title=${title}::${line}`);
  summary([`### ${title}`, ...lines.map((l) => `- ${l}`)]);
  process.exitCode = 1;
}

/** Live owners anywhere, not just in this ledger: cross-run leak check. */
async function residual(deps: CleanupDeps) {
  const live = (await deps.tuturuuu.list()).filter(
    (u) => u.purpose === QA_PURPOSE && u.deletedAt === null
  );
  const listed = await deps.upskii.list({});
  const identities = listed.users.filter((i) => i.runLabel);
  return [
    ...live.map((u) => `tuturuuu QA account ${u.userId} (run ${u.runId})`),
    ...identities.map((i) => `upskii QA identity ${i.userId}`),
    // More pages means more unpurged identities: never report clean.
    ...(listed.more ? ['upskii QA identities beyond the first page'] : []),
  ];
}

async function main(command: string | undefined, restArgs: readonly string[]) {
  if (command === 'preflight') {
    const options = parsePreflightArgs(restArgs, process.env);
    const report = await runUpskiiPreflight(options);
    const lines = formatPreflightSummary(report);
    if (options.json) {
      const summaryFile = process.env.GITHUB_STEP_SUMMARY;
      if (summaryFile) appendFileSync(summaryFile, `${lines.join('\n')}\n`);
      console.log(JSON.stringify(report, null, 2));
    } else {
      summary(lines);
    }
    if (!report.ok) {
      if (!options.json) {
        const failedLines = report.checks
          .filter((c) => c.status === 'fail')
          .map((c) => `${c.name}: ${c.detail}`);
        for (const line of failedLines) {
          console.log(
            `::error title=Upskii read-only pre-flight failed::${line}`
          );
        }
      }
      process.exitCode = 1;
    }
    return;
  }

  const config = readRunConfig(process.env);
  const deps: CleanupDeps = {
    tuturuuu: tuturuuuQaClient(githubOidcAuth(process.env)),
    upskii: upskiiProvisioner(
      required(process.env, 'UPSKII_QA_PROVISIONER_TOKEN')
    ),
  };
  const ledger = new Ledger(config.ledgerPath);

  if (command === 'sweep') {
    const { swept, failures } = await sweep(deps);
    summary([`Orphan sweep: ${swept.length} owner(s) removed`, ...swept]);
    if (failures.length) fail('Orphan sweep failed', failures);
    return;
  }
  if (command === 'cleanup') {
    // Passwords leave the runner even when Playwright crashed before teardown.
    forgetActors(config);
    const failures = await cleanup(ledger, deps);
    const owners = ledger.read().filter((r) => r.cleaned).length;
    summary([`Cleanup: ${owners} owner(s) settled`]);
    if (failures.length) fail('Cleanup failed', failures);
    return;
  }
  if (command === 'verify') {
    const leaks = await verify(ledger, deps);
    const others = await residual(deps);
    if (leaks.length || others.length)
      fail('Production E2E leaked test data', [
        ...leaks.map((l) => `${l.kind} ${l.key}: ${l.reason}`),
        ...others.map((o) => `${o}: still live after cleanup`),
      ]);
    else summary(['Cleanup verified: no QA data remains']);
    return;
  }
  throw new Error('Usage: cli.ts preflight|sweep|cleanup|verify');
}

const preflightJsonMode =
  process.argv[2] === 'preflight' && process.argv.includes('--json');

main(process.argv[2], process.argv.slice(3)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown error';
  if (preflightJsonMode) {
    console.error(JSON.stringify({ error: message, ok: false }));
    process.exitCode = 1;
    return;
  }
  fail('Production E2E CLI crashed', [message]);
});
