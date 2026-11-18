import { HISTORY_TRACKS } from '@tuturuuu/roadmap-core/content/track-names.ts';
import {
  commitWindow,
  type CommitFact,
} from '@tuturuuu/roadmap-core/insights/commits.ts';
import {
  assembleLiveData,
  fetchMain,
  fetchPullFacts,
} from '@tuturuuu/roadmap-core/live/github.ts';

const DAY = 86_400_000;
const DAYS = 7;
const MAX_PAGES = 20;
const REPO = 'https://api.github.com/repos/tutur3u/platform';

export async function observeActivity(now: number, fetcher = fetch) {
  const github = (url: string, init?: RequestInit) =>
    fetcher(url, {
      ...init,
      redirect: 'error',
      signal: AbortSignal.timeout(8_000),
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': 'tuturuuu-roadmap',
      },
    });
  const main = await fetchMain(github);
  if (!main) throw new Error('Main observation unavailable');
  const { commits, prs } = await readActivity(now, main.sha, github);
  return {
    live: assembleLiveData({ now, source: 'live', main, prs, hosts: [] }),
    commits,
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
      (DAYS - 1) * DAY
  ).toISOString();
  const facts = new Map<string, CommitFact>();
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
      return {
        commits: commitWindow([...facts.values()], {
          now,
          days: DAYS,
          trackIds: HISTORY_TRACKS,
          production: null,
        }),
        prs,
      };
    }
  }
  throw new Error('GitHub commit page limit reached');
}

export type RoadmapObservation = Awaited<ReturnType<typeof observeActivity>>;
