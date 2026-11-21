#!/usr/bin/env node
// Writes the store delivery receipt and keeps one open GitHub issue labeled
// mobile-store-alert while store publication is failing. Fleet monitors watch
// that label; the next fully successful run comments and closes the issue.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const ALERT_LABEL = 'mobile-store-alert';
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

async function github(path, { method = 'GET', body } = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok && !(method === 'POST' && path.endsWith('/labels')))
    throw new Error(`GitHub API ${method} ${path} failed (${response.status})`);
  return response.status === 204 ? null : response.json().catch(() => null);
}

export function alertAction(receipt, openIssue) {
  if (receipt.status === 'failed') return openIssue ? 'comment' : 'open';
  if (receipt.status === 'published' && openIssue) return 'close';
  return 'none';
}

export async function syncAlert(receipt, repository) {
  const repo = `/repos/${repository}`;
  const open = await github(
    `${repo}/issues?labels=${ALERT_LABEL}&state=open&per_page=1`
  );
  const issue = open?.[0] ?? null;
  const action = alertAction(receipt, issue);
  const body = receiptMarkdown(receipt);
  if (action === 'open') {
    await github(`${repo}/labels`, {
      method: 'POST',
      body: { name: ALERT_LABEL, color: 'b60205' },
    });
    await github(`${repo}/issues`, {
      method: 'POST',
      body: {
        title: `Mobile store publication failing (${receipt.failed.join(', ')})`,
        labels: [ALERT_LABEL],
        body,
      },
    });
  } else if (action === 'comment' || action === 'close') {
    await github(`${repo}/issues/${issue.number}/comments`, {
      method: 'POST',
      body: { body },
    });
    if (action === 'close')
      await github(`${repo}/issues/${issue.number}`, {
        method: 'PATCH',
        body: { state: 'closed', state_reason: 'completed' },
      });
  }
  return action;
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
      if (!process.env.GITHUB_TOKEN)
        throw new Error('GITHUB_TOKEN is required for alert sync');
      const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
      const action = await syncAlert(receipt, process.env.GITHUB_REPOSITORY);
      console.log(`Alert issue action: ${action}.`);
    } else {
      throw new Error('Expected write or alert');
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
