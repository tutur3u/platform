import { GITHUB_OWNER, GITHUB_REPO } from '@/constants/common';

export interface GithubContributor {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
  contributions: number;
}

export interface RepoSnapshot {
  stars: number;
  forks: number;
  issues: number;
  contributors: GithubContributor[];
  /** False when GitHub was unreachable, so the page can say so honestly. */
  ok: boolean;
}

interface GithubRepo {
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
}

/**
 * Repository stats, fetched on the server.
 *
 * The page this replaces did all of this from the browser inside `useEffect`
 * — which the repo forbids, and which fired roughly twenty-seven sequential
 * unauthenticated calls per visit (repo, contributors, a `/users/:login`
 * lookup for each of twenty-five contributors, plus a search). GitHub allows
 * sixty per hour per IP unauthenticated, so the page reliably broke for real
 * visitors and blamed it on "failed to fetch".
 *
 * Fetching here means one shared, cached pair of requests from our own
 * infrastructure, and the per-contributor enrichment is dropped entirely: the
 * contributors endpoint already returns the login, avatar and commit count,
 * which is everything the page actually renders.
 */
async function githubJson<T>(path: string): Promise<T | undefined> {
  try {
    const response = await fetch(`https://api.github.com${path}`, {
      headers: { Accept: 'application/vnd.github+json' },
      // Refresh hourly rather than on every request; contributor counts do not
      // move fast enough to justify hitting GitHub per visitor.
      next: { revalidate: 3600 },
    });

    if (!response.ok) return undefined;

    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}

export async function getRepoSnapshot(): Promise<RepoSnapshot> {
  const [repo, contributors] = await Promise.all([
    githubJson<GithubRepo>(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}`),
    githubJson<GithubContributor[]>(
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contributors?per_page=48`
    ),
  ]);

  return {
    stars: repo?.stargazers_count ?? 0,
    forks: repo?.forks_count ?? 0,
    issues: repo?.open_issues_count ?? 0,
    contributors: contributors ?? [],
    ok: Boolean(repo && contributors),
  };
}

export const repoUrl = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
