import { REPO, type HostFact, type LiveData, type PrFact } from './model.ts';
import type { ProbeResult } from './host-probe.ts';

/**
 * Public GitHub REST reads. The browser calls these unauthenticated (each
 * viewer's own quota); the build may pass a read token for rate limits only.
 */

const API = 'https://api.github.com';
const SHA = /^[a-f0-9]{40}$/;

export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

async function getJson(fetcher: Fetcher, path: string, token?: string) {
  const headers: Record<string, string> = {
    accept: 'application/vnd.github+json',
  };
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetcher(`${API}${path}`, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error(`GitHub ${response.status} for ${path.split('?')[0]}`);
  return (await response.json()) as unknown;
}

type SearchItem = {
  number: number;
  title: string;
  state: string;
  draft?: boolean;
  user?: { type?: string } | null;
  pull_request?: { merged_at?: string | null };
};

function toFact(
  item: SearchItem,
  approved: ReadonlySet<number>
): PrFact | null {
  if (
    !item ||
    typeof item.number !== 'number' ||
    typeof item.title !== 'string'
  )
    return null;
  if (item.user?.type === 'Bot') return null;
  const mergedAt = item.pull_request?.merged_at ?? null;
  const state = mergedAt ? 'merged' : item.state === 'open' ? 'open' : 'closed';
  return {
    number: item.number,
    title: item.title.slice(0, 300),
    state,
    draft: Boolean(item.draft),
    approved: state === 'open' && approved.has(item.number),
    mergedAt: mergedAt ? new Date(mergedAt).toISOString() : null,
  };
}

async function search(
  fetcher: Fetcher,
  query: string,
  maxPages: number,
  token?: string
): Promise<SearchItem[]> {
  const items: SearchItem[] = [];
  for (let page = 1; page <= maxPages; page += 1) {
    const params = new URLSearchParams({
      q: `repo:${REPO} is:pr ${query}`,
      per_page: '100',
      page: String(page),
      sort: 'updated',
      order: 'desc',
    });
    const body = (await getJson(
      fetcher,
      `/search/issues?${params}`,
      token
    )) as {
      total_count?: number;
      items?: SearchItem[];
    };
    const batch = Array.isArray(body.items) ? body.items : [];
    items.push(...batch);
    if (batch.length < 100 || items.length >= (body.total_count ?? 0)) break;
  }
  return items;
}

export async function fetchPullFacts(
  fetcher: Fetcher,
  now: number,
  options: {
    days?: number;
    token?: string;
    openPages?: number;
    mergedPages?: number;
  } = {}
): Promise<PrFact[]> {
  const since = new Date(now - (options.days ?? 8) * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const [approvedItems, openItems, mergedItems] = await Promise.all([
    search(fetcher, 'is:open review:approved', 1, options.token),
    search(fetcher, 'is:open', options.openPages ?? 3, options.token),
    search(
      fetcher,
      `is:merged merged:>=${since}`,
      options.mergedPages ?? 5,
      options.token
    ),
  ]);
  const approved = new Set(approvedItems.map((item) => item.number));
  const facts = new Map<number, PrFact>();
  for (const item of [...openItems, ...mergedItems]) {
    const fact = toFact(item, approved);
    if (fact) facts.set(fact.number, fact);
  }
  return [...facts.values()];
}

/** Specific PRs (build time): curated deliverables older than the window. */
export async function fetchPullsByNumber(
  fetcher: Fetcher,
  numbers: readonly number[],
  approved: ReadonlySet<number>,
  token?: string
): Promise<PrFact[]> {
  const facts: PrFact[] = [];
  const queue = [...new Set(numbers)];
  async function worker() {
    while (queue.length) {
      const number = queue.shift() as number;
      const pr = (await getJson(
        fetcher,
        `/repos/${REPO}/pulls/${number}`,
        token
      ).catch(() => null)) as {
        number?: number;
        title?: string;
        state?: string;
        draft?: boolean;
        merged_at?: string | null;
        user?: { type?: string } | null;
      } | null;
      if (!pr || pr.number !== number) continue;
      const fact = toFact(
        {
          number,
          title: pr.title ?? '',
          state: pr.state ?? 'closed',
          draft: pr.draft,
          user: null,
          pull_request: { merged_at: pr.merged_at ?? null },
        },
        approved
      );
      if (fact) facts.push(fact);
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  return facts;
}

export async function fetchMain(fetcher: Fetcher, token?: string) {
  const body = (await getJson(
    fetcher,
    `/repos/${REPO}/commits/main`,
    token
  )) as {
    sha?: string;
    commit?: { committer?: { date?: string } };
  };
  const at = body.commit?.committer?.date;
  if (!body.sha || !SHA.test(body.sha) || !at)
    throw new Error('Invalid main commit');
  return { sha: body.sha, at: new Date(at).toISOString() };
}

/** Deployed commit vs main: commits behind, and the deployed point on main. */
export async function fetchCompare(
  fetcher: Fetcher,
  commit: string,
  token?: string
) {
  if (!SHA.test(commit)) throw new Error('Invalid commit');
  const body = (await getJson(
    fetcher,
    `/repos/${REPO}/compare/${commit}...main?per_page=1`,
    token
  )) as {
    ahead_by?: number;
    merge_base_commit?: { commit?: { committer?: { date?: string } } };
  };
  const at = body.merge_base_commit?.commit?.committer?.date;
  if (typeof body.ahead_by !== 'number' || !at)
    throw new Error('Invalid compare');
  return { behindBy: body.ahead_by, commitAt: new Date(at).toISOString() };
}

export async function hostFacts(
  fetcher: Fetcher,
  probes: readonly ProbeResult[],
  token?: string
): Promise<HostFact[]> {
  const commits = [
    ...new Set(probes.map((p) => p.commit).filter(Boolean)),
  ] as string[];
  const compared = new Map<
    string,
    { behindBy: number; commitAt: string } | null
  >();
  await Promise.all(
    commits.slice(0, 12).map(async (commit) => {
      compared.set(
        commit,
        await fetchCompare(fetcher, commit, token).catch(() => null)
      );
    })
  );
  return probes.map((probe) => {
    const compare = probe.commit ? compared.get(probe.commit) : null;
    return {
      app: probe.app,
      platform: probe.platform,
      commit: probe.commit,
      commitAt: compare?.commitAt ?? null,
      behindBy: compare?.behindBy ?? null,
    };
  });
}

export function assembleLiveData(input: {
  now: number;
  source: LiveData['source'];
  main: LiveData['main'];
  prs: PrFact[];
  hosts: HostFact[];
}): LiveData {
  return {
    schema: 1,
    generatedAt: new Date(input.now).toISOString(),
    source: input.source,
    main: input.main,
    prs: [...input.prs].sort((a, b) => b.number - a.number),
    hosts: [...input.hosts].sort((a, b) => a.app.localeCompare(b.app)),
  };
}
