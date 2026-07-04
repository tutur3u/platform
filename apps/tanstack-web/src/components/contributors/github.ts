import { queryOptions } from '@tanstack/react-query';
import { createServerFn } from '@tanstack/react-start';
import { GITHUB_OWNER, GITHUB_REPO } from '@tuturuuu/utils/constants';
import type {
  ContributorsData,
  GitHubContributor,
  GitHubRepo,
  GitHubUser,
} from './types';

export const repositoryName = `${GITHUB_OWNER}/${GITHUB_REPO}`;
export const repositoryUrl = `https://github.com/${repositoryName}`;
export const repositoryForkUrl = `${repositoryUrl}/fork`;

async function githubApiJson<T>(path: string): Promise<T | undefined> {
  try {
    const response = await fetch(`https://api.github.com${path}`, {
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
      },
    });

    if (!response.ok) {
      return undefined;
    }

    return (await response.json()) as T;
  } catch {
    return undefined;
  }
}

async function fetchGitHubRepo() {
  return githubApiJson<GitHubRepo>(`/repos/${GITHUB_OWNER}/${GITHUB_REPO}`);
}

async function fetchGitHubContributors() {
  return (
    (await githubApiJson<GitHubContributor[]>(
      `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contributors?per_page=25`
    )) ?? []
  );
}

async function fetchGitHubUser(username: string) {
  return githubApiJson<GitHubUser>(`/users/${encodeURIComponent(username)}`);
}

async function fetchPullRequests() {
  const params = new URLSearchParams({
    per_page: '1',
    q: `repo:${repositoryName} is:pr`,
  });
  const searchData = await githubApiJson<{ total_count: number }>(
    `/search/issues?${params.toString()}`
  );

  return searchData?.total_count ?? 0;
}

async function loadContributorsDataFromGitHub(): Promise<ContributorsData> {
  try {
    const [repo, contributors] = await Promise.all([
      fetchGitHubRepo(),
      fetchGitHubContributors(),
    ]);

    const [enrichedContributors, pullRequests] = await Promise.all([
      Promise.all(
        contributors.map(async (contributor) => ({
          ...contributor,
          userDetails: await fetchGitHubUser(contributor.login),
        }))
      ),
      fetchPullRequests(),
    ]);

    return {
      contributors: enrichedContributors,
      repo,
      stats: {
        contributors: contributors.length,
        forks: repo?.forks_count ?? 0,
        issues: repo?.open_issues_count ?? 0,
        pullRequests,
        stars: repo?.stargazers_count ?? 0,
      },
    };
  } catch {
    return {
      contributors: [],
      error: 'Failed to fetch GitHub data. Please try again later.',
      stats: {
        contributors: 0,
        forks: 0,
        issues: 0,
        pullRequests: 0,
        stars: 0,
      },
    };
  }
}

export const loadContributorsData = createServerFn({ method: 'GET' }).handler(
  loadContributorsDataFromGitHub
);

export const contributorsQuery = queryOptions({
  queryFn: loadContributorsData,
  queryKey: ['github-contributors', repositoryName],
  staleTime: 5 * 60_000,
});
