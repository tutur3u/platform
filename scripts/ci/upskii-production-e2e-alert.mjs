#!/usr/bin/env node
// Keeps one open GitHub issue labeled upskii-production-e2e-alert while the
// Upskii production E2E workflow is failing. Fleet monitors watch the label;
// the next successful run comments and closes the issue.
import { pathToFileURL } from 'node:url';

export const ALERT_LABEL = 'upskii-production-e2e-alert';

export function alertAction(result, openIssue) {
  if (result === 'failure' || result === 'cancelled')
    return openIssue ? 'comment' : 'open';
  if (result === 'success' && openIssue) return 'close';
  return 'none';
}

export function alertBody({ result, trigger, runUrl }) {
  return [
    `Upskii production E2E: **${result}** (trigger: ${trigger}).`,
    '',
    `Run: ${runUrl}`,
    '',
    'Read the job summary for the failing suite and the cleanup verdict.',
    'Runbook: apps/docs/build/devops/upskii-production-e2e.mdx',
  ].join('\n');
}

async function github(path, { method = 'GET', body } = {}, fetchImpl = fetch) {
  const response = await fetchImpl(`https://api.github.com${path}`, {
    method,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      'x-github-api-version': '2022-11-28',
      ...(body ? { 'content-type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15_000),
  });
  // Creating an existing label answers 422; that is fine.
  if (!response.ok && !(method === 'POST' && path.endsWith('/labels')))
    throw new Error(`GitHub API ${method} ${path} failed (${response.status})`);
  return response.status === 204 ? null : response.json().catch(() => null);
}

export async function syncAlert(env, fetchImpl = fetch) {
  const repo = `/repos/${env.GITHUB_REPOSITORY}`;
  const call = (path, init) => github(path, init, fetchImpl);
  const open = await call(
    `${repo}/issues?labels=${ALERT_LABEL}&state=open&per_page=1`
  );
  const issue = open?.[0] ?? null;
  const action = alertAction(env.E2E_RESULT, issue);
  const body = alertBody({
    result: env.E2E_RESULT,
    trigger: env.E2E_TRIGGER,
    runUrl: env.E2E_RUN_URL,
  });
  if (action === 'open') {
    await call(`${repo}/labels`, {
      method: 'POST',
      body: { name: ALERT_LABEL, color: 'b60205' },
    });
    await call(`${repo}/issues`, {
      method: 'POST',
      body: {
        title: 'Upskii production E2E failing',
        labels: [ALERT_LABEL],
        body,
      },
    });
  } else if (action === 'comment' || action === 'close') {
    await call(`${repo}/issues/${issue.number}/comments`, {
      method: 'POST',
      body: { body },
    });
    if (action === 'close')
      await call(`${repo}/issues/${issue.number}`, {
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
  try {
    if (!process.env.GITHUB_TOKEN) throw new Error('GITHUB_TOKEN is required');
    const action = await syncAlert(process.env);
    console.log(`Alert issue action: ${action}.`);
    if (action === 'open' || action === 'comment')
      console.log(
        '::error title=Upskii production E2E failed::See the alert issue.'
      );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
