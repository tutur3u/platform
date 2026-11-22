// Fails when a production tuturuuu.com host or path is still answered by
// Vercel. Vercel deployments are disabled, so any response carrying an
// x-vercel-* header, `server: Vercel` or status 402 (DEPLOYMENT_DISABLED)
// is a path that still falls through to it.
//
// usage: node scripts/ci/vercel-free-smoke.mjs [url ...]
// With no arguments it checks DEFAULT_TARGETS. Each URL is fetched once
// without following redirects, so a Cloudflare 301 counts as served.
import { fileURLToPath } from 'node:url';

export const DEFAULT_TARGETS = [
  'https://tuturuuu.com/',
  'https://tuturuuu.com/login',
  'https://tuturuuu.com/download',
  'https://tuturuuu.com/tools',
  'https://tuturuuu.com/contacts',
  'https://tuturuuu.com/mind',
  'https://tuturuuu.com/api/v1/workspaces/personal/calendar/events',
  'https://tuturuuu.com/api/v1/auth/cross-app-token/verify',
  'https://web-api.tuturuuu.com/api/v1/auth/cross-app-token/verify',
  'https://calendar.tuturuuu.com/',
  'https://chat.tuturuuu.com/',
  'https://cms.tuturuuu.com/',
  'https://drive.tuturuuu.com/',
  'https://forms.tuturuuu.com/',
  'https://mail.tuturuuu.com/',
  'https://tasks.tuturuuu.com/',
  'https://teach.tuturuuu.com/',
  'https://tools.tuturuuu.com/',
  'https://track.tuturuuu.com/',
  'https://infrastructure.tuturuuu.com/',
  'https://apps.tuturuuu.com/',
  'https://contacts.tuturuuu.com/',
  'https://mind.tuturuuu.com/',
  'https://www.tuturuuu.com/',
];

/**
 * The Vercel markers on one response. `headers` is a Headers-like object
 * or a plain record of lower-case names.
 */
export function vercelMarkers({ status, headers }) {
  const get = (name) =>
    typeof headers?.get === 'function'
      ? headers.get(name)
      : (headers?.[name] ?? null);
  const names =
    typeof headers?.keys === 'function'
      ? [...headers.keys()]
      : Object.keys(headers ?? {});
  const markers = [];
  if (status === 402) markers.push('status 402');
  for (const name of names) {
    if (name.toLowerCase().startsWith('x-vercel-')) {
      markers.push(`${name.toLowerCase()}: ${get(name)}`);
    }
  }
  if (/vercel/i.test(get('server') ?? ''))
    markers.push(`server: ${get('server')}`);
  return markers;
}

export async function checkTargets(targets, fetchImpl = fetch) {
  const results = [];
  for (const url of targets) {
    try {
      const response = await fetchImpl(url, {
        redirect: 'manual',
        headers: { 'user-agent': 'tuturuuu-vercel-free-smoke/1' },
        signal: AbortSignal.timeout(20_000),
      });
      await response.body?.cancel();
      results.push({
        url,
        status: response.status,
        markers: vercelMarkers(response),
      });
    } catch (error) {
      results.push({ url, status: null, markers: [], error: error.message });
    }
  }
  return results;
}

async function main(args) {
  const results = await checkTargets(args.length ? args : DEFAULT_TARGETS);
  let failed = 0;
  for (const result of results) {
    const bad = result.markers.length > 0;
    if (bad) failed++;
    const detail = result.error ?? (bad ? result.markers.join('; ') : 'ok');
    console.log(
      `${bad ? 'FAIL' : 'ok  '} ${result.status ?? '---'} ${result.url} ${detail}`
    );
  }
  if (failed) {
    console.error(
      `::error::${failed} production path(s) still answered by Vercel`
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main(process.argv.slice(2)).catch((error) => {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  });
