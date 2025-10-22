/**
 * Parses a GitHub issue URL and extracts owner, repo, and issue number
 * @param url - GitHub issue URL (e.g., "https://github.com/owner/repo/issues/123")
 * @returns Object with owner, repo, and issue_number, or null if invalid
 */
export function parseGitHubIssueUrl(url: string): {
  owner: string;
  repo: string;
  issue_number: number;
} | null {
  try {
    const urlObj = new URL(url);

    // Check if it's a GitHub URL
    if (urlObj.hostname !== 'github.com') {
      return null;
    }

    // Parse the pathname: /owner/repo/issues/123
    const pathParts = urlObj.pathname.split('/').filter(Boolean);

    // Expected format: [owner, repo, 'issues', issue_number]
    if (pathParts.length < 4 || pathParts[2] !== 'issues') {
      return null;
    }

    const owner = pathParts[0];
    const repo = pathParts[1];
    const issueNumber = parseInt(pathParts[3], 10);

    // Validate
    if (!owner || !repo || isNaN(issueNumber) || issueNumber <= 0) {
      return null;
    }

    return {
      owner,
      repo,
      issue_number: issueNumber,
    };
  } catch {
    return null;
  }
}

/**
 * Builds a GitHub issue URL from owner, repo, and issue number
 * @param owner - GitHub repository owner
 * @param repo - GitHub repository name
 * @param issueNumber - GitHub issue number
 * @returns Full GitHub issue URL
 */
export function buildGitHubIssueUrl(
  owner: string,
  repo: string,
  issueNumber: number
): string {
  return `https://github.com/${owner}/${repo}/issues/${issueNumber}`;
}

/**
 * Validates if a URL is a valid GitHub issue URL
 * @param url - URL to validate
 * @returns True if valid GitHub issue URL
 */
export function isValidGitHubIssueUrl(url: string): boolean {
  return parseGitHubIssueUrl(url) !== null;
}
