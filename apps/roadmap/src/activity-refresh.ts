import { BUILD_ACTIVITY } from '@tuturuuu/roadmap-core/insights/build-activity.ts';
import { HISTORY_TRACKS } from '@tuturuuu/roadmap-core/content/track-names.ts';
import {
  commitWindow,
  type CommitFact,
  type CommitWindow,
} from '@tuturuuu/roadmap-core/insights/commits.ts';
import {
  assembleLiveData,
  fetchMain,
  fetchPullFacts,
} from '@tuturuuu/roadmap-core/live/github.ts';

import { githubRateLimit } from './github-rate-limit';
import {
  buildRoadmapSnapshot,
  DAY_MS as DAY,
  readProduction,
  ROADMAP_DAYS,
  type RoadmapSnapshot,
} from './roadmap-snapshot';

const MAX_PAGES = 42;
const REPO = 'https://api.github.com/repos/tutur3u/platform';

export async function observeActivity(
  now: number,
  previousDeploys: RoadmapSnapshot['deploys'] = [],
  fetcher = fetch
) {
  const github = async (url: string, init?: RequestInit) => {
    let response: Response | undefined;
    try {
      response = await fetcher(url, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(8_000),
        headers: {
          accept: 'application/vnd.github+json',
          'user-agent': 'tuturuuu-roadmap',
        },
      });
      return response;
    } finally {
      const expectedResource = url.startsWith('https://api.github.com/search/')
        ? 'search'
        : 'core';
      console.info(
        JSON.stringify(
          githubRateLimit(expectedResource, response, new Date().toISOString())
        )
      );
    }
  };
  const main = await fetchMain(github);
  if (!main) throw new Error('Main observation unavailable');
  const { facts, prs, parentsBySha } = await readActivity(
    now,
    main.sha,
    github
  );
  const deployed = await readProduction(fetcher, now);
  const window = commitWindow(facts, {
    now,
    days: ROADMAP_DAYS,
    trackIds: HISTORY_TRACKS,
    production: null,
  });
  const from = new Date(Date.parse(window.to) - 6 * DAY)
    .toISOString()
    .slice(0, 10);
  const commits: CommitWindow = {
    ...window,
    from,
    days: window.days.filter(([day]) => day >= from),
    products: window.products.filter(([day]) => day >= from),
  };
  return {
    live: assembleLiveData({ now, source: 'live', main, prs, hosts: [] }),
    commits,
    roadmap: buildRoadmapSnapshot({
      now,
      window,
      facts,
      prs,
      deployed,
      previousDeploys,
      buildDeploys: BUILD_ACTIVITY.deploys,
      parentsBySha,
    }),
  };
}

async function readActivity(
  now: number,
  sha: string,
  github: (url: string) => Promise<Response>
) {
  const since = new Date(
    Math.floor((now + 7 * 3_600_000) / DAY) * DAY -
      7 * 3_600_000 -
      (ROADMAP_DAYS - 1) * DAY
  ).toISOString();
  const facts = new Map<string, CommitFact>();
  const parentsBySha = new Map<string, string[]>();
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const query = new URLSearchParams({
      sha,
      since,
      per_page: '100',
      page: String(page),
    });
    const reply = await github(`${REPO}/commits?${query}`);
    if (!reply.ok) throw new Error('GitHub commits unavailable');
    const rows: unknown = await reply.json();
    if (!Array.isArray(rows) || rows.length > 100)
      throw new Error('Malformed GitHub commit page');
    for (const row of rows) {
      const { sha: id, commit } = row ?? {};
      const at = commit?.committer?.date;
      const message = commit?.message;
      if (
        typeof id !== 'string' ||
        !/^[a-f0-9]{40}$/.test(id) ||
        typeof at !== 'string' ||
        !Number.isFinite(Date.parse(at)) ||
        typeof message !== 'string'
      )
        throw new Error('Malformed GitHub commit');
      if (Array.isArray(row.parents)) {
        parentsBySha.set(
          id,
          row.parents.flatMap((parent: unknown) => {
            if (
              !parent ||
              typeof parent !== 'object' ||
              !('sha' in parent) ||
              typeof parent.sha !== 'string' ||
              !/^[a-f0-9]{40}$/.test(parent.sha)
            )
              return [];
            return [parent.sha];
          })
        );
      }
      facts.set(id, {
        sha: id,
        at,
        subject: message.split('\n', 1)[0] ?? '',
        authorName:
          typeof row.author?.login === 'string' ? row.author.login : '',
        authorEmail:
          typeof commit.author?.email === 'string' ? commit.author.email : '',
        files: [],
        inProduction: false,
      });
    }
    if (!/rel="next"/.test(reply.headers.get('link') ?? '')) {
      let mergedComplete = false;
      const prs = await fetchPullFacts(github, now, {
        days: 8,
        openPages: 1,
        mergedPages: 4,
        onMergedComplete: (complete) => {
          mergedComplete = complete;
        },
      });
      if (!mergedComplete)
        throw new Error('GitHub merged PR page limit reached');
      return { facts: [...facts.values()], prs, parentsBySha };
    }
  }
  throw new Error('GitHub commit page limit reached');
}

export type RoadmapObservation = Awaited<ReturnType<typeof observeActivity>>;
