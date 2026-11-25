#!/usr/bin/env node
// Writes the store delivery receipt and keeps one open internal alert task
// (key mobile-store) while store publication is failing; the next fully
// successful run comments and resolves it. Alerts never open GitHub issues.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  attemptUrl,
  reportTaskAlert,
  summarizeTaskAlert,
} from '../ci/ttr-task-alert.mjs';

export const ALERT_KEY = 'mobile-store';
const STAGES = [
  ['check', 'Check CI config'],
  ['gate', 'Decide mobile store publish'],
  ['preflight', 'Check mobile deployment credentials'],
  ['android', 'Google Play internal + testing tracks'],
  ['ios', 'TestFlight upload + beta groups'],
];

export function buildReceipt(env) {
  const results = Object.fromEntries(
    STAGES.map(([key]) => [
      key,
      env[`RESULT_${key.toUpperCase()}`] || 'skipped',
    ])
  );
  const failed = STAGES.filter(([key]) =>
    ['failure', 'cancelled'].includes(results[key])
  ).map(([key]) => key);
  const published = ['android', 'ios'].every(
    (key) => results[key] === 'success'
  );
  return {
    sha: env.GITHUB_SHA,
    run: `${env.GITHUB_SERVER_URL}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`,
    runAttempt: Number(env.GITHUB_RUN_ATTEMPT || 1),
    version: /^\d+\.\d+\.\d+$/u.test(env.MOBILE_BUILD_NAME ?? '')
      ? env.MOBILE_BUILD_NAME
      : null,
    buildNumber: /^[1-9]\d{0,9}$/u.test(env.MOBILE_BUILD_NUMBER ?? '')
      ? env.MOBILE_BUILD_NUMBER
      : null,
    // Only counts leave the runner: track IDs are not verified here and
    // group names can be private.
    playTestingTrackCount: splitList(env.GOOGLE_PLAY_BETA_TRACKS).length,
    testflightExternalGroupCount: splitList(env.TESTFLIGHT_EXTERNAL_BETA_GROUPS)
      .length,
    results,
    status: failed.length ? 'failed' : published ? 'published' : 'incomplete',
    failed,
  };
}

function splitList(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function receiptMarkdown(receipt) {
  const rows = STAGES.map(
    ([key, label]) => `| ${label} | ${receipt.results[key]} |`
  );
  return [
    `### Mobile store receipt: ${receipt.status}`,
    '',
    `- Version: \`${receipt.version ?? 'not assigned'}\``,
    `- Store build number: \`${receipt.buildNumber ?? 'not assigned'}\``,
    `- Commit: \`${receipt.sha}\``,
    `- Configured Google Play testing tracks: ${receipt.playTestingTrackCount || 'none (internal only)'}`,
    `- Configured TestFlight external groups: ${receipt.testflightExternalGroupCount || 'none (internal only)'}`,
    `- Run: ${receipt.run} (attempt ${receipt.runAttempt})`,
    '',
    '| Stage | Result |',
    '| --- | --- |',
    ...rows,
    '',
  ].join('\n');
}

export function alertState(receipt) {
  if (receipt.status === 'failed') return 'failing';
  if (receipt.status === 'published') return 'recovered';
  return null;
}

export async function syncAlert(receipt, env = process.env, fetchImpl = fetch) {
  const state = alertState(receipt);
  if (!state) return 'none';
  return reportTaskAlert(
    {
      key: ALERT_KEY,
      state,
      title: 'Mobile store publication failing',
      body: receiptMarkdown(receipt),
      runUrl: attemptUrl(receipt.run, receipt.runAttempt),
    },
    env,
    fetchImpl
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [mode, receiptPath = 'mobile-store-receipt.json'] =
    process.argv.slice(2);
  try {
    if (mode === 'write') {
      const receipt = buildReceipt(process.env);
      writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
      if (process.env.GITHUB_STEP_SUMMARY)
        appendFileSync(
          process.env.GITHUB_STEP_SUMMARY,
          receiptMarkdown(receipt)
        );
      console.log(JSON.stringify(receipt));
      if (receipt.status === 'failed')
        console.log(
          `::error title=Mobile store publication failed::${receipt.failed.join(', ')}`
        );
    } else if (mode === 'alert') {
      const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
      const action = await syncAlert(receipt);
      summarizeTaskAlert(ALERT_KEY, action);
      console.log(`Alert task action: ${action}.`);
    } else {
      throw new Error('Expected write or alert');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
