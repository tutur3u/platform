import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';

export interface GitHubIssueData {
  owner: string;
  repo: string;
  issue_number: number;
  github_url: string;
  github_title: string;
  github_state: 'open' | 'closed';
  github_labels: string[];
  github_assignees: string[];
  github_created_at: string;
  github_updated_at: string;
  github_closed_at: string | null;
}

/**
 * Creates an authenticated Octokit instance using GitHub App credentials
 */
async function getOctokit(): Promise<Octokit> {
  const appId = process.env.NEXT_PUBLIC_GITHUB_APP_ID;
  const privateKey = process.env.NEXT_PUBLIC_GITHUB_APP_PRIVATE_KEY;
  const installationId = process.env.NEXT_PUBLIC_GITHUB_APP_INSTALLATION_ID;

  if (!appId || !privateKey || !installationId) {
    throw new Error('GitHub App credentials not configured');
  }

  const auth = createAppAuth({
    appId,
    privateKey: Buffer.from(privateKey, 'base64').toString('utf-8'),
    installationId: Number(installationId),
  });

  const { token } = await auth({ type: 'installation' });
  return new Octokit({ auth: token });
}

/**
 * Fetches GitHub issue data from the GitHub API
 * @param owner - GitHub repository owner
 * @param repo - GitHub repository name
 * @param issueNumber - GitHub issue number
 * @returns GitHub issue data
 * @throws Error if issue not found or API error
 */
export async function fetchGitHubIssueData(
  owner: string,
  repo: string,
  issueNumber: number
): Promise<GitHubIssueData> {
  const octokit = await getOctokit();

  const { data } = await octokit.issues.get({
    owner,
    repo,
    issue_number: issueNumber,
  });

  return {
    owner,
    repo,
    issue_number: issueNumber,
    github_url: data.html_url,
    github_title: data.title,
    github_state: data.state as 'open' | 'closed',
    github_labels: data.labels.map((label) =>
      typeof label === 'string' ? label : label.name || ''
    ),
    github_assignees: data.assignees?.map((a) => a.login) || [],
    github_created_at: data.created_at,
    github_updated_at: data.updated_at,
    github_closed_at: data.closed_at,
  };
}

/**
 * Fetches GitHub issue data from URL
 * @param url - Full GitHub issue URL
 * @returns GitHub issue data
 * @throws Error if URL is invalid or issue not found
 */
export async function fetchGitHubIssueDataFromUrl(
  url: string
): Promise<GitHubIssueData> {
  // Parse URL to extract owner, repo, and issue number
  const urlObj = new URL(url);
  const pathParts = urlObj.pathname.split('/').filter(Boolean);

  if (pathParts.length < 4 || pathParts[2] !== 'issues') {
    throw new Error('Invalid GitHub issue URL');
  }

  const owner = pathParts[0];
  const repo = pathParts[1];
  const issueNumber = parseInt(pathParts[3], 10);

  if (!owner || !repo || isNaN(issueNumber)) {
    throw new Error('Invalid GitHub issue URL');
  }

  return fetchGitHubIssueData(owner, repo, issueNumber);
}
