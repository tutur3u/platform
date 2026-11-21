#!/usr/bin/env node
// Compare redirect answers for existing short links between two Shortener
// origins (for example the current ttr.gg and a candidate Worker) before and
// after a cutover. Usage:
//   node apps/shortener/cloudflare/redirect-parity.mjs \
//     --baseline https://ttr.gg --candidate https://<worker-host> \
//     --slugs slugs.txt [--host ttr.gg]
// `slugs.txt` holds one stored slug per line. Requests send no cookies or
// credentials and never follow redirects. Each GET resolves the link like a
// visitor, so both runtimes record one analytics click per slug: keep the
// sample small. `--host` sends that Host header to the candidate.
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

export async function probe(origin, slug, fetcher = fetch, headers = {}) {
  const path = slug
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const response = await fetcher(`${origin.replace(/\/$/, '')}/${path}`, {
    method: 'GET',
    redirect: 'manual',
    headers: { 'user-agent': 'tuturuuu-shortener-parity', ...headers },
  });
  await response.body?.cancel();
  return {
    status: response.status,
    location: response.headers.get('location'),
  };
}

export function sameAnswer(a, b) {
  return a.status === b.status && a.location === b.location;
}

export async function compare({ baseline, candidate, slugs, host, fetcher }) {
  const rows = [];
  for (const slug of slugs) {
    const [left, right] = await Promise.all([
      probe(baseline, slug, fetcher),
      probe(candidate, slug, fetcher, host ? { host } : {}),
    ]);
    rows.push({
      slug,
      baseline: left,
      candidate: right,
      ok: sameAnswer(left, right),
    });
  }
  return rows;
}

async function main() {
  const { values } = parseArgs({
    options: {
      baseline: { type: 'string' },
      candidate: { type: 'string' },
      slugs: { type: 'string' },
      host: { type: 'string' },
    },
  });
  if (!values.baseline || !values.candidate || !values.slugs) {
    console.error('Required: --baseline, --candidate and --slugs');
    process.exit(2);
  }
  const slugs = (await readFile(values.slugs, 'utf8'))
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const rows = await compare({ ...values, slugs });
  for (const row of rows)
    console.log(
      `${row.ok ? 'ok  ' : 'DIFF'} ${row.slug} baseline=${row.baseline.status} ${row.baseline.location ?? '-'} candidate=${row.candidate.status} ${row.candidate.location ?? '-'}`
    );
  const failed = rows.filter((row) => !row.ok).length;
  console.log(`${rows.length - failed}/${rows.length} matched`);
  process.exit(failed ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
