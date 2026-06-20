import type { LucideIcon } from '@tuturuuu/icons/lucide';

export interface GitHubUser {
  avatar_url: string;
  bio?: string;
  created_at?: string;
  html_url: string;
  id: number;
  login: string;
  name?: string;
}

export interface GitHubRepo {
  description: string;
  forks_count: number;
  full_name: string;
  html_url: string;
  id: number;
  name: string;
  open_issues_count: number;
  stargazers_count: number;
}

export interface GitHubContributor {
  avatar_url: string;
  contributions: number;
  html_url: string;
  id: number;
  login: string;
  userDetails?: GitHubUser;
}

export interface RepoStats {
  contributors: number;
  forks: number;
  issues: number;
  pullRequests: number;
  stars: number;
}

export interface ContributorsData {
  contributors: GitHubContributor[];
  error?: string;
  repo?: GitHubRepo;
  stats: RepoStats;
}

export type ContributorTone =
  | 'amber'
  | 'blue'
  | 'cyan'
  | 'green'
  | 'pink'
  | 'purple';

export interface ContributorStat {
  color: ContributorTone;
  icon: LucideIcon;
  label: string;
  trend: string;
  value: number;
}
