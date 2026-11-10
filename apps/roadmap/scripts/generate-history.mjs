#!/usr/bin/env node
/**
 * Build-time project history: every merged PR in tutur3u/platform since the
 * first one (Oct 2022), from the public GitHub REST API, classified and
 * pre-aggregated per week, month and year (src/history/build.ts).
 *
 * GITHUB_TOKEN / GH_TOKEN is used only to lift rate limits and is never
 * written. On any fetch failure the committed history is kept untouched.
 * ROADMAP_OFFLINE=1 skips the refresh.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HISTORY_TRACKS } from '../src/content/track-names.ts';
import { buildHistory, parseHistory } from '../src/history/build.ts';
import { REPO } from '../src/live/model.ts';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(root, 'src/generated/history.json');
const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || undefined;
const log = (message) => process.stderr.write(`[roadmap-history] ${message}\n`);

async function page(n) {
  const headers = { accept: 'application/vnd.github+json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const url = `https://api.github.com/repos/${REPO}/pulls?state=closed&sort=created&direction=asc&per_page=100&page=${n}`;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(30_000),
    });
    if (response.ok) return response.json();
    if (response.status < 500) throw new Error(`GitHub ${response.status}`);
  }
  throw new Error('GitHub unavailable');
}

/** Compact, diff-friendly JSON: one entry or period per line. */
export function serialize(history) {
  const line = (value) => JSON.stringify(value);
  const block = (rows) =>
    `[\n${rows.map((row) => `    ${line(row)}`).join(',\n')}\n  ]`;
  return `{
  "schema": 1,
  "generatedAt": ${line(history.generatedAt)},
  "tracks": ${line(history.tracks)},
  "entries": ${block(history.entries)},
  "aggregates": {
    "week": ${block(history.aggregates.week)},
    "month": ${block(history.aggregates.month)},
    "year": ${block(history.aggregates.year)}
  }
}
`;
}

async function main() {
  if (process.env.ROADMAP_OFFLINE === '1') {
    log('ROADMAP_OFFLINE=1: keeping committed history');
    return;
  }
  if (!token) {
    log(
      'no GITHUB_TOKEN: keeping committed history (anonymous limits are too low)'
    );
    return;
  }
  const pulls = [];
  try {
    for (let start = 1; ; start += 8) {
      const batch = await Promise.all(
        Array.from({ length: 8 }, (_, i) => page(start + i))
      );
      for (const items of batch)
        for (const pr of items)
          if (pr.merged_at)
            pulls.push({
              number: pr.number,
              title: String(pr.title ?? ''),
              mergedAt: pr.merged_at,
              author: pr.user
                ? { type: pr.user.type, login: pr.user.login }
                : null,
            });
      if (batch.some((items) => items.length < 100)) break;
    }
  } catch (error) {
    log(`GitHub unavailable (${error.message}); keeping committed history`);
    return;
  }
  const history = parseHistory(
    JSON.parse(
      serialize(buildHistory(pulls, HISTORY_TRACKS, new Date().toISOString()))
    )
  );
  try {
    const previous = parseHistory(JSON.parse(readFileSync(target, 'utf8')));
    if (history.entries.length < previous.entries.length * 0.9) {
      log(
        `refusing to shrink history (${previous.entries.length} → ${history.entries.length})`
      );
      return;
    }
  } catch {
    // No valid previous file: write the fresh one.
  }
  writeFileSync(target, serialize(history));
  const titled = history.entries.filter((e) => e[4]).length;
  log(
    `wrote ${history.entries.length} merged PRs (${titled} titled) since ${history.entries.at(-1)?.[1]} at ${history.generatedAt}`
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1])
  await main();
