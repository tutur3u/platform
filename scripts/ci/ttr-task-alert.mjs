// Reports a CI alert to the internal task backlog (Tasks `POST /api/v1/ci/alerts`)
// instead of a public GitHub issue. The server keeps one open task per alert
// key, comments on repeats and resolves it on recovery.
//
// Needs TTR_CI_ALERT_TOKEN (GitHub environment secret `ci-alerts`). Without it
// the caller still writes its job summary and annotations; nothing is filed.
import { appendFileSync } from 'node:fs';

export const DEFAULT_CI_ALERT_URL =
  'https://tasks.tuturuuu.com/api/v1/ci/alerts';

// The sink caps a report body at 8000 characters.
export const MAX_ALERT_BODY = 7800;

export function boundedBody(body) {
  const text = String(body);
  if (text.length <= MAX_ALERT_BODY) return text;
  // Never leave half of a surrogate pair behind.
  const cut = text.slice(0, MAX_ALERT_BODY).replace(/[\uD800-\uDBFF]$/u, '');
  return `${cut}\n\n(Truncated; read the run summary.)`;
}

export async function reportTaskAlert(
  alert,
  env = process.env,
  fetchImpl = fetch
) {
  const token = env.TTR_CI_ALERT_TOKEN;
  if (!token) return 'unconfigured';
  const url = env.TTR_CI_ALERT_URL || DEFAULT_CI_ALERT_URL;
  const response = await fetchImpl(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-ci-alert-token': token,
    },
    body: JSON.stringify({ ...alert, body: boundedBody(alert.body) }),
    redirect: 'error',
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok)
    throw new Error(`CI alert sync failed (${response.status})`);
  const data = await response.json().catch(() => null);
  return data?.action ?? 'none';
}

/** One job-summary line per alert key so the run shows what was filed. */
export function summarizeTaskAlert(key, action, env = process.env) {
  const line = `- Internal alert task \`${key}\`: ${action}.\n`;
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, line);
  return line;
}

/** The run attempt's URL: each re-run of failed jobs reports separately. */
export function attemptUrl(runUrl, attempt) {
  const base = String(runUrl).replace(/\/attempts\/\d+$/u, '');
  return /^[1-9]\d*$/u.test(String(attempt ?? ''))
    ? `${base}/attempts/${attempt}`
    : base;
}
