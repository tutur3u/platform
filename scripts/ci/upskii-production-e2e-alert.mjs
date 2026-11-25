#!/usr/bin/env node
// Keeps one open internal alert task (key upskii-production-e2e) while the
// Upskii production E2E workflow is failing; the next successful run comments
// and resolves it. Alerts never open public GitHub issues.
import { pathToFileURL } from 'node:url';
import {
  attemptUrl,
  reportTaskAlert,
  summarizeTaskAlert,
} from './ttr-task-alert.mjs';

export const ALERT_KEY = 'upskii-production-e2e';

export function alertState(result) {
  if (result === 'failure' || result === 'cancelled') return 'failing';
  if (result === 'success') return 'recovered';
  return null;
}

export function alertBody({ result, trigger, runUrl }) {
  return [
    `Upskii production E2E: ${result} (trigger: ${trigger}).`,
    '',
    `Run: ${runUrl}`,
    '',
    'Read the job summary for the failing suite and the cleanup verdict.',
    'Runbook: apps/docs/build/devops/upskii-production-e2e.mdx',
  ].join('\n');
}

export async function syncAlert(env, fetchImpl = fetch) {
  const state = alertState(env.E2E_RESULT);
  if (!state) return 'none';
  return reportTaskAlert(
    {
      key: ALERT_KEY,
      state,
      title: 'Upskii production E2E failing',
      body: alertBody({
        result: env.E2E_RESULT,
        trigger: env.E2E_TRIGGER,
        runUrl: env.E2E_RUN_URL,
      }),
      runUrl: attemptUrl(env.E2E_RUN_URL, env.E2E_RUN_ATTEMPT),
    },
    env,
    fetchImpl
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const action = await syncAlert(process.env);
    summarizeTaskAlert(ALERT_KEY, action);
    console.log(`Alert task action: ${action}.`);
    if (alertState(process.env.E2E_RESULT) === 'failing')
      console.log(
        '::error title=Upskii production E2E failed::See the job summary and the internal alert task.'
      );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
