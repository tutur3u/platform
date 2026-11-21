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
// sample small.
//
// `--host` sends that Host header to the candidate, for a Worker served
// locally (for example `vp preview` or workerd on 127.0.0.1) that only answers
// production hostnames. fetch() drops a custom Host header, so probes use
// node:http(s) directly. It is refused for non-loopback candidates: an edge
// routes by Host, so a remote request would reach production instead.
import http from 'node:http';
import https from 'node:https';
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]']);
const TIMEOUT_MS = 15_000;

/** One GET without redirects; resolves `{ status, location }`. */
export function nodeRequest(url, headers) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const client = target.protocol === 'https:' ? https : http;
    const request = client.request(
      target,
      { method: 'GET', headers },
      (response) => {
        response.resume();
        resolve({
          status: response.statusCode,
          location: response.headers.location ?? null,
        });
      }
    );
    request.setTimeout(TIMEOUT_MS, () =>
      request.destroy(new Error(`Timed out: ${url}`))
    );
    request.on('error', reject);
    request.end();
  });
}

export function assertHostOverrideAllowed(candidate, host) {
  if (host && !LOOPBACK.has(new URL(candidate).hostname))
    throw new Error(
      '--host needs a loopback candidate (127.0.0.1, localhost or [::1])'
    );
}

export async function probe(origin, slug, request = nodeRequest, headers = {}) {
  const path = slug
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return request(`${origin.replace(/\/$/, '')}/${path}`, {
    'user-agent': 'tuturuuu-shortener-parity',
    ...headers,
  });
}

export function sameAnswer(a, b) {
  return a.status === b.status && a.location === b.location;
}

export async function compare({ baseline, candidate, slugs, host, request }) {
  assertHostOverrideAllowed(candidate, host);
  const rows = [];
  for (const slug of slugs) {
    const [left, right] = await Promise.all([
      probe(baseline, slug, request),
      probe(candidate, slug, request, host ? { host } : {}),
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
