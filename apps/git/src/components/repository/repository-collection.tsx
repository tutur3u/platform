import {
  CheckCircle2,
  CircleDot,
  Clock,
  GitCommitHorizontal,
  GitPullRequest,
  Play,
  Tag,
  User,
  XCircle,
} from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { Card } from '@tuturuuu/ui/card';
import { Input } from '@tuturuuu/ui/input';
import Link from 'next/link';
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

export function RepositoryCollection({
  emptyMessage,
  items,
  owner,
  repository,
  searchQuery,
  title,
}: {
  emptyMessage: string;
  items: CollectionItem[];
  owner: string;
  repository: string;
  searchQuery?: string;
  title: string;
}) {
  return (
    <section className="space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.2em]">
            {owner}/{repository}
          </p>
          <h1 className="mt-1 font-semibold text-2xl tracking-tight">
            {title}
          </h1>
        </div>
        <form className="w-full sm:max-w-xs">
          <Input
            aria-label={`Search ${title.toLowerCase()}`}
            defaultValue={searchQuery}
            name="q"
            placeholder={`Filter ${title.toLowerCase()}…`}
            type="search"
          />
        </form>
      </div>
      <Card className="divide-y overflow-hidden">
        {items.length ? (
          items.map((item, index) => (
            <CollectionRow
              key={`${item.kind}-${getItemKey(item)}-${index}`}
              item={item}
              owner={owner}
              repository={repository}
            />
          ))
        ) : (
          <div className="p-12 text-center text-muted-foreground text-sm">
            {emptyMessage}
          </div>
        )}
      </Card>
    </section>
  );
}

function CollectionRow({
  item,
  owner,
  repository,
}: {
  item: CollectionItem;
  owner: string;
  repository: string;
}) {
  if (item.kind === 'commit') {
    const commit = item.value;
    return (
      <RowLink href={`/${owner}/${repository}/commit/${commit.sha}`}>
        <GitCommitHorizontal className="mt-1 h-4 w-4 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate font-medium">
            {firstLine(commit.commit.message)}
          </p>
          <Meta>
            {commit.commit.author?.name ?? commit.author?.login ?? 'Unknown'} ·{' '}
            {formatDate(commit.commit.author?.date)}
          </Meta>
        </div>
        <code className="text-muted-foreground text-xs">
          {commit.sha.slice(0, 7)}
        </code>
      </RowLink>
    );
  }

  if (item.kind === 'issue' || item.kind === 'pull') {
    const issue = item.value;
    const isPull = item.kind === 'pull';
    return (
      <RowLink
        href={`/${owner}/${repository}/${isPull ? 'pull' : 'issues'}/${issue.number}`}
      >
        {isPull ? (
          <GitPullRequest className="mt-1 h-4 w-4 text-muted-foreground" />
        ) : (
          <CircleDot className="mt-1 h-4 w-4 text-muted-foreground" />
        )}
        <div className="min-w-0">
          <p className="font-medium">{issue.title}</p>
          <Meta>
            #{issue.number} · {issue.user?.login ?? 'Unknown'} ·{' '}
            {formatDate(issue.updated_at)}
          </Meta>
          <div className="mt-2 flex flex-wrap gap-1">
            {issue.labels.slice(0, 5).map((label) => (
              <Badge key={label.name} variant="outline">
                {label.name}
              </Badge>
            ))}
          </div>
        </div>
        <Badge variant={issue.state === 'open' ? 'secondary' : 'outline'}>
          {issue.state}
        </Badge>
      </RowLink>
    );
  }

  if (item.kind === 'release') {
    const release = item.value;
    return (
      <RowLink href={release.html_url}>
        <Tag className="mt-1 h-4 w-4 text-muted-foreground" />
        <div className="min-w-0">
          <p className="font-medium">{release.name || release.tag_name}</p>
          <Meta>
            {release.tag_name} · {formatDate(release.published_at)}
          </Meta>
        </div>
        {release.prerelease && <Badge variant="outline">Pre-release</Badge>}
      </RowLink>
    );
  }

  if (item.kind === 'run') {
    const run = item.value;
    const Icon =
      run.conclusion === 'success'
        ? CheckCircle2
        : run.conclusion === 'failure'
          ? XCircle
          : run.status === 'in_progress'
            ? Play
            : Clock;
    return (
      <RowLink href={`/${owner}/${repository}/actions/${run.id}`}>
        <Icon className="mt-1 h-4 w-4 text-muted-foreground" />
        <div className="min-w-0">
          <p className="font-medium">{run.name}</p>
          <Meta>
            #{run.run_number} · {run.event} ·{' '}
            {run.head_branch ?? run.head_sha.slice(0, 7)} ·{' '}
            {formatDate(run.updated_at)}
          </Meta>
        </div>
        <Badge variant="outline">{run.conclusion ?? run.status}</Badge>
      </RowLink>
    );
  }

  if (item.kind === 'contributor') {
    const contributor = item.value;
    return (
      <RowLink href={contributor.html_url}>
        <Avatar className="h-8 w-8">
          <AvatarImage src={contributor.avatar_url} alt="" />
          <AvatarFallback>
            <User className="h-4 w-4" />
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="font-medium">{contributor.login}</p>
          <Meta>{contributor.contributions} contributions</Meta>
        </div>
        <span />
      </RowLink>
    );
  }

  const ref = item.value;
  return (
    <RowLink
      href={`/${owner}/${repository}/tree?ref=${encodeURIComponent(ref.name)}`}
    >
      <Tag className="mt-1 h-4 w-4 text-muted-foreground" />
      <div className="min-w-0">
        <p className="font-medium font-mono">{ref.name}</p>
        <Meta>{ref.commit.sha.slice(0, 12)}</Meta>
      </div>
      <span />
    </RowLink>
  );
}

function RowLink({
  children,
  href,
}: {
  children: React.ReactNode;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="grid grid-cols-[28px_minmax(0,1fr)_auto] gap-3 p-4 transition-colors hover:bg-muted/40"
    >
      {children}
    </Link>
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-muted-foreground text-xs">{children}</p>;
}

function firstLine(value: string) {
  return value.split('\n')[0] || value;
}

function formatDate(value?: string | null) {
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
