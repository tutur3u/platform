export type GitRepository = {
  archived: boolean;
  defaultBranch: string;
  description: string | null;
  enabled: boolean;
  githubRepositoryId: number;
  homepageUrl: string | null;
  id: string;
  name: string;
  owner: string;
  visibility: 'public';
};

export type GitHubActor = {
  avatar_url: string;
  html_url: string;
  login: string;
};

export type GitHubRepository = {
  archived: boolean;
  default_branch: string;
  description: string | null;
  forks_count: number;
  full_name: string;
  homepage: string | null;
  html_url: string;
  language: string | null;
  license: { name: string; spdx_id: string } | null;
  name: string;
  open_issues_count: number;
  owner: GitHubActor;
  pushed_at: string;
  size: number;
  stargazers_count: number;
  subscribers_count: number;
  topics: string[];
  visibility: string;
};

export type GitHubContent = {
  content?: string;
  download_url: string | null;
  html_url: string;
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'dir' | 'file' | 'submodule' | 'symlink';
};

export type GitHubCommit = {
  author: GitHubActor | null;
  commit: {
    author: { date: string; email: string; name: string } | null;
    message: string;
  };
  html_url: string;
  sha: string;
};

export type GitHubIssue = {
  comments: number;
  created_at: string;
  html_url: string;
  labels: Array<{ color: string; name: string }>;
  number: number;
  pull_request?: { url: string };
  state: string;
  title: string;
  updated_at: string;
  user: GitHubActor | null;
};

export type GitHubPullRequest = GitHubIssue & {
  draft: boolean;
  merged_at: string | null;
};

export type GitHubRelease = {
  assets: Array<{
    browser_download_url: string;
    download_count: number;
    name: string;
    size: number;
  }>;
  author: GitHubActor;
  body: string | null;
  created_at: string;
  draft: boolean;
  html_url: string;
  name: string | null;
  prerelease: boolean;
  published_at: string | null;
  tag_name: string;
};

export type GitHubWorkflowRun = {
  conclusion: string | null;
  created_at: string;
  event: string;
  head_branch: string | null;
  head_sha: string;
  html_url: string;
  id: number;
  name: string;
  run_number: number;
  status: string;
  updated_at: string;
};

export type GitHubContributor = GitHubActor & {
  contributions: number;
};

export type GitHubPage<T> = {
  items: T[];
  nextPage: number | null;
};

export type GitHubIssueComment = {
  body: string;
  created_at: string;
  html_url: string;
  id: number;
  user: GitHubActor | null;
};

export type GitHubPullFile = {
  additions: number;
  changes: number;
  deletions: number;
  filename: string;
  patch?: string;
  status: string;
};

export type GitHubPullReview = {
  body: string;
  id: number;
  state: string;
  submitted_at?: string | null;
  user: GitHubActor;
};

export type GitHubWorkflowJob = {
  completed_at: string | null;
  conclusion: string | null;
  html_url: string;
  id: number;
  name: string;
  started_at: string | null;
  status: string;
  steps?: Array<{
    conclusion: string | null;
    name: string;
    number: number;
    status: string;
  }>;
};

export type GitHubWorkflowArtifact = {
  archive_download_url: string;
  expired: boolean;
  expires_at: string | null;
  id: number;
  name: string;
  size_in_bytes: number;
};

export type RepositoryOverview = {
  languages: Record<string, number>;
  readme: { content: string; path: string } | null;
  repository: GitHubRepository;
  rootContent: GitHubContent[];
};
