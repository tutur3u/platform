import type {
  GitHubCommit,
  GitHubContributor,
  GitHubIssue,
  GitHubRelease,
  GitHubWorkflowRun,
  GitHubPullRequest as PullRequest,
} from '@/lib/github/types';

export type CollectionItem =
  | { kind: 'commit'; value: GitHubCommit }
  | { kind: 'issue'; value: GitHubIssue }
  | { kind: 'pull'; value: PullRequest }
  | { kind: 'release'; value: GitHubRelease }
  | { kind: 'run'; value: GitHubWorkflowRun }
  | { kind: 'contributor'; value: GitHubContributor }
  | { kind: 'ref'; value: { name: string; commit: { sha: string } } };

export type CollectionRow = {
  avatarUrl?: string;
  href: string;
  key: string;
  kind: CollectionItem['kind'];
  labels?: string[];
  meta: string;
  search: string;
  state: string;
  timestamp: number;
  title: string;
  trailing?: string;
};

const DATE_FORMATTER = new Intl.DateTimeFormat('en', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function toCollectionRow(
  item: CollectionItem,
  owner: string,
  repository: string
): CollectionRow {
  const row = getCollectionRow(item, owner, repository);
  const searchableValues = [
    row.title,
    row.meta,
    row.state,
    row.trailing,
    ...(row.labels ?? []),
  ];

  return {
    ...row,
    key: `${item.kind}-${getItemKey(item)}`,
    search: searchableValues.filter(Boolean).join(' ').toLowerCase(),
    timestamp: getItemTimestamp(item),
  };
}

export function firstLine(value: string) {
  return value.split('\n')[0] || value;
}

export function formatDate(value?: string | null) {
  if (!value) return 'Unknown time';
  return DATE_FORMATTER.format(new Date(value));
}

function getCollectionRow(
  item: CollectionItem,
  owner: string,
  repository: string
): Omit<CollectionRow, 'key' | 'search' | 'timestamp'> {
  if (item.kind === 'commit') {
    const commit = item.value;
    const actor =
      commit.commit.author?.name ?? commit.author?.login ?? 'Unknown';
    return {
      href: `/${owner}/${repository}/commit/${commit.sha}`,
      kind: item.kind,
      meta: `${actor} · ${formatDate(commit.commit.author?.date)}`,
      state: '',
      title: firstLine(commit.commit.message),
      trailing: commit.sha.slice(0, 7),
    };
  }

  if (item.kind === 'issue' || item.kind === 'pull') {
    const issue = item.value;
    return {
      href: `/${owner}/${repository}/${item.kind === 'pull' ? 'pull' : 'issues'}/${issue.number}`,
      kind: item.kind,
      labels: issue.labels.slice(0, 4).map((label) => label.name),
      meta: `#${issue.number} · ${issue.user?.login ?? 'Unknown'} · ${formatDate(issue.updated_at)}`,
      state: issue.state,
      title: issue.title,
    };
  }

  if (item.kind === 'release') {
    const release = item.value;
    return {
      href: release.html_url,
      kind: item.kind,
      meta: `${release.tag_name} · ${formatDate(release.published_at)}`,
      state: release.prerelease ? 'pre-release' : 'release',
      title: release.name || release.tag_name,
    };
  }

  if (item.kind === 'run') {
    const run = item.value;
    return {
      href: `/${owner}/${repository}/actions/${run.id}`,
      kind: item.kind,
      meta: `#${run.run_number} · ${run.event} · ${run.head_branch ?? run.head_sha.slice(0, 7)} · ${formatDate(run.updated_at)}`,
      state: run.conclusion ?? run.status,
      title: run.name,
    };
  }

  if (item.kind === 'contributor') {
    const contributor = item.value;
    return {
      avatarUrl: contributor.avatar_url,
      href: contributor.html_url,
      kind: item.kind,
      meta: `${contributor.contributions} contributions`,
      state: '',
      title: contributor.login,
    };
  }

  return {
    href: `/${owner}/${repository}/tree?ref=${encodeURIComponent(item.value.name)}`,
    kind: item.kind,
    meta: item.value.commit.sha.slice(0, 12),
    state: '',
    title: item.value.name,
  };
}

function getItemKey(item: CollectionItem) {
  switch (item.kind) {
    case 'commit':
      return item.value.sha;
    case 'issue':
    case 'pull':
      return item.value.number;
    case 'release':
      return item.value.tag_name;
    case 'run':
      return item.value.id;
    case 'contributor':
      return item.value.login;
    case 'ref':
      return item.value.name;
  }
}

function getItemTimestamp(item: CollectionItem) {
  switch (item.kind) {
    case 'commit':
      return Date.parse(item.value.commit.author?.date ?? '') || 0;
    case 'issue':
    case 'pull':
      return Date.parse(item.value.updated_at) || 0;
    case 'release':
      return Date.parse(item.value.published_at ?? item.value.created_at) || 0;
    case 'run':
      return Date.parse(item.value.updated_at) || 0;
    case 'contributor':
      return item.value.contributions;
    case 'ref':
      return 0;
  }
}
