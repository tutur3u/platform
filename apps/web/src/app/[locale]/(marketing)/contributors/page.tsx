import ContributorsClient from './client';
import { GITHUB_OWNER, GITHUB_REPO } from '@/constants/common';
import { LoadingIndicator } from '@ncthub/ui/custom/loading-indicator';
import { createAppAuth } from '@octokit/auth-app';
import { Octokit } from '@octokit/rest';
import type { Metadata } from 'next';
import { getLocale } from 'next-intl/server';
import { Suspense } from 'react';

export const metadata: Metadata = {
  title: 'Community Contributors',
  description:
    'Celebrate the builders and designers who contribute to NCT Hub.',
};

// Define static generation parameters
export const dynamic = 'force-static';
export const revalidate = 3600; // Revalidate the data every hour

const MAX_CONTRIBUTORS = 20;

export interface GithubUser {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
  name?: string;
  bio?: string;
  created_at?: string;
}

export interface GithubRepo {
  id: number;
  name: string;
  full_name: string;
  html_url: string;
  description: string;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
}

export interface GithubContributor {
  login: string;
  id: number;
  avatar_url: string;
  html_url: string;
  contributions: number;
  userDetails?: GithubUser;
}

export interface RepoStats {
  stars: number;
  forks: number;
  issues: number;
  contributors: number;
  pullRequests: number;
}

// Initialize GitHub App authentication
async function getAuthenticatedOctokit() {
  // Get GitHub App credentials from environment variables
  const appId = process.env.GITHUB_APP_ID;
  const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;

  // If GitHub App credentials are missing, proceed without authentication
  if (!appId || !privateKey || !installationId) {
    console.warn(
      'GitHub App credentials not found. Using unauthenticated requests.'
    );
    return new Octokit();
  }

  try {
    const auth = createAppAuth({
      appId,
      privateKey,
      installationId: Number(installationId),
    });

    const { token } = await auth({ type: 'installation' });

    return new Octokit({
      auth: token,
    });
  } catch (error) {
    console.error('Failed to authenticate with GitHub App:', error);
    return new Octokit();
  }
}

// Fetch GitHub repository data using Octokit
async function fetchGithubRepo(
  octokit: Octokit,
  owner: string = GITHUB_OWNER,
  repo: string = GITHUB_REPO
): Promise<GithubRepo | undefined> {
  try {
    const { data } = await octokit.repos.get({
      owner,
      repo,
    });

    return data as GithubRepo;
  } catch (error) {
    console.error('Error fetching GitHub repository:', error);
    return undefined;
  }
}

// Fetch GitHub contributors using Octokit
async function fetchGithubContributors(
  octokit: Octokit,
  owner: string = GITHUB_OWNER,
  repo: string = GITHUB_REPO
): Promise<GithubContributor[]> {
  try {
    const { data } = await octokit.repos.get({ owner, repo });

    if (!data.fork || !data.parent) {
      const { data } = await octokit.repos.listContributors({
        owner,
        repo,
        per_page: MAX_CONTRIBUTORS,
      });

      return data as GithubContributor[];
    }

    const parentOwner = data.parent.owner.login;
    const defaultBranch = data.default_branch;
    const parentDefaultBranch = data.parent.default_branch;

    // Use Compare API instead of fetching all commits
    // This compares parent's default branch with fork's default branch
    const comparison = await octokit.paginate(
      octokit.repos.compareCommitsWithBasehead,
      {
        owner,
        repo,
        basehead: `${parentOwner}:${parentDefaultBranch}...${owner}:${defaultBranch}`,
        per_page: 250, // Max allowed per page
      }
    );

    if (!Array.isArray(comparison)) return [];
    const commits = comparison.flatMap((c) => c.commits);
    const contributorsMap = new Map<string, GithubContributor>();

    // Process commits from the comparison (only unique commits in fork)
    commits.forEach((commit) => {
      if (commit.author) {
        const login = commit.author.login;
        const existing = contributorsMap.get(login);

        if (existing) {
          existing.contributions += 1;
        } else {
          contributorsMap.set(login, {
            login: commit.author.login,
            id: commit.author.id,
            avatar_url: commit.author.avatar_url,
            html_url: commit.author.html_url,
            contributions: 1,
          });
        }
      }
    });

    return Array.from(contributorsMap.values())
      .sort((a, b) => b.contributions - a.contributions)
      .slice(0, MAX_CONTRIBUTORS);
  } catch (error) {
    console.error('Error fetching GitHub contributors:', error);
    return [];
  }
}

// Fetch GitHub user details using Octokit
async function fetchGithubUser(
  octokit: Octokit,
  username: string
): Promise<GithubUser | undefined> {
  try {
    const { data } = await octokit.users.getByUsername({
      username,
    });

    return data as GithubUser;
  } catch (error) {
    console.error(`Error fetching GitHub user ${username}:`, error);
    return undefined;
  }
}

// Fetch pull requests count using Octokit
async function fetchPullRequests(
  octokit: Octokit,
  owner: string = GITHUB_OWNER,
  repo: string = GITHUB_REPO
): Promise<number> {
  try {
    // Get all pull requests to count them
    const pulls = await octokit.paginate(octokit.rest.pulls.list, {
      owner,
      repo,
      state: 'all',
      per_page: 100,
    });

    return pulls.length;
  } catch (error) {
    console.error('Error fetching GitHub pull requests:', error);
    return 0;
  }
}

// Function to get all GitHub data with authenticated requests
async function getGithubData() {
  try {
    const owner = GITHUB_OWNER;
    const repo = GITHUB_REPO;

    // Get authenticated Octokit instance
    const octokit = await getAuthenticatedOctokit();

    // Fetch repository data
    const repoData = await fetchGithubRepo(octokit, owner, repo);

    // Fetch pull requests count
    const pullRequestsCount = await fetchPullRequests(octokit, owner, repo);

    // Fetch contributors
    const contributors = await fetchGithubContributors(octokit, owner, repo);

    // Enrich contributors with user details
    const enrichedContributors = await Promise.all(
      contributors.map(async (contributor) => {
        // Only fetch details for top contributors to minimize API calls
        try {
          const userDetails = await fetchGithubUser(octokit, contributor.login);
          return { ...contributor, userDetails };
        } catch (err) {
          console.warn(
            `Failed to fetch details for ${contributor.login}:`,
            err
          );
          return contributor;
        }
      })
    );

    // Create stats object
    const stats: RepoStats = {
      stars: repoData?.stargazers_count || 0,
      forks: repoData?.forks_count || 0,
      issues: repoData?.open_issues_count || 0,
      contributors: contributors.length,
      pullRequests: pullRequestsCount,
    };

    // Return the data
    return {
      repo: repoData,
      contributors: enrichedContributors,
      stats,
    };
  } catch (error) {
    console.error('Error fetching GitHub data:', error);
    return {
      error: 'Failed to fetch GitHub data. Please try again later.',
    };
  }
}

// Loading component for Suspense fallback
function LoadingContributors() {
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center">
      <LoadingIndicator className="mb-4 h-12 w-12" />
      <p className="text-muted-foreground">Loading contributors data...</p>
    </div>
  );
}

export default async function ContributorsPage() {
  const locale = await getLocale();
  const githubData = await getGithubData();

  return (
    <div className="container space-y-12 pt-12 pb-20 md:pt-20 md:pb-32">
      <Suspense fallback={<LoadingContributors />}>
        <ContributorsClient githubData={githubData} locale={locale} />
      </Suspense>
    </div>
  );
}
