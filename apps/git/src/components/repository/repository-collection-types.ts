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
  item: CollectionItem;
  key: string;
  search: string;
  state: string;
  timestamp: number;
  title: string;
};

export function toCollectionRow(item: CollectionItem): CollectionRow {
  return {
    item,
    key: `${item.kind}-${getItemKey(item)}`,
    search: JSON.stringify(item.value).toLowerCase(),
    state: getItemState(item),
    timestamp: getItemTimestamp(item),
    title: getItemTitle(item),
  };
}

export function firstLine(value: string) {
  return value.split('\n')[0] || value;
}

export function formatDate(value?: string | null) {
  if (!value) return 'Unknown time';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
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

function getItemTitle(item: CollectionItem) {
  switch (item.kind) {
    case 'commit':
      return firstLine(item.value.commit.message);
    case 'issue':
    case 'pull':
      return item.value.title;
    case 'release':
      return item.value.name || item.value.tag_name;
    case 'run':
      return item.value.name;
    case 'contributor':
      return item.value.login;
    case 'ref':
      return item.value.name;
  }
}

function getItemState(item: CollectionItem) {
  switch (item.kind) {
    case 'issue':
    case 'pull':
      return item.value.state;
    case 'run':
      return item.value.conclusion ?? item.value.status;
    case 'release':
      return item.value.prerelease ? 'pre-release' : 'release';
    default:
      return '';
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
