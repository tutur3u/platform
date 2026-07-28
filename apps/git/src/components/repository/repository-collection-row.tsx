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
import Link from 'next/link';
import {
  type CollectionItem,
  firstLine,
  formatDate,
} from './repository-collection-types';

export function CollectionRowView({
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
        <GitCommitHorizontal className="h-4 w-4 text-muted-foreground" />
        <RowText
          meta={`${commit.commit.author?.name ?? commit.author?.login ?? 'Unknown'} · ${formatDate(commit.commit.author?.date)}`}
          title={firstLine(commit.commit.message)}
        />
        <code className="text-[11px] text-muted-foreground">
          {commit.sha.slice(0, 7)}
        </code>
      </RowLink>
    );
  }

  if (item.kind === 'issue' || item.kind === 'pull') {
    const issue = item.value;
    const isPull = item.kind === 'pull';
    const Icon = isPull ? GitPullRequest : CircleDot;
    return (
      <RowLink
        href={`/${owner}/${repository}/${isPull ? 'pull' : 'issues'}/${issue.number}`}
      >
        <Icon className="h-4 w-4 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate font-medium text-sm">{issue.title}</p>
          <p className="truncate text-[11px] text-muted-foreground">
            #{issue.number} · {issue.user?.login ?? 'Unknown'} ·{' '}
            {formatDate(issue.updated_at)}
          </p>
          {issue.labels.length > 0 && (
            <div className="mt-1 flex gap-1 overflow-hidden">
              {issue.labels.slice(0, 4).map((label) => (
                <Badge
                  className="h-4 rounded px-1 text-[9px]"
                  key={label.name}
                  variant="outline"
                >
                  {label.name}
                </Badge>
              ))}
            </div>
          )}
        </div>
        <Badge className="h-5 text-[10px]" variant="outline">
          {issue.state}
        </Badge>
      </RowLink>
    );
  }

  if (item.kind === 'release') {
    return (
      <RowLink href={item.value.html_url}>
        <Tag className="h-4 w-4 text-muted-foreground" />
        <RowText
          meta={`${item.value.tag_name} · ${formatDate(item.value.published_at)}`}
          title={item.value.name || item.value.tag_name}
        />
        {item.value.prerelease ? (
          <Badge className="h-5 text-[10px]" variant="outline">
            Pre-release
          </Badge>
        ) : (
          <span />
        )}
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
        <Icon className="h-4 w-4 text-muted-foreground" />
        <RowText
          meta={`#${run.run_number} · ${run.event} · ${run.head_branch ?? run.head_sha.slice(0, 7)} · ${formatDate(run.updated_at)}`}
          title={run.name}
        />
        <Badge className="h-5 text-[10px]" variant="outline">
          {run.conclusion ?? run.status}
        </Badge>
      </RowLink>
    );
  }

  if (item.kind === 'contributor') {
    return (
      <RowLink href={item.value.html_url}>
        <Avatar className="h-6 w-6">
          <AvatarImage alt="" src={item.value.avatar_url} />
          <AvatarFallback>
            <User className="h-3.5 w-3.5" />
          </AvatarFallback>
        </Avatar>
        <RowText
          meta={`${item.value.contributions} contributions`}
          title={item.value.login}
        />
        <span />
      </RowLink>
    );
  }

  return (
    <RowLink
      href={`/${owner}/${repository}/tree?ref=${encodeURIComponent(item.value.name)}`}
    >
      <Tag className="h-4 w-4 text-muted-foreground" />
      <RowText
        meta={item.value.commit.sha.slice(0, 12)}
        title={item.value.name}
      />
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
      className="grid min-h-[62px] grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2.5 px-3 py-2 transition-colors hover:bg-foreground/[0.035]"
      href={href}
    >
      {children}
    </Link>
  );
}

function RowText({ meta, title }: { meta: string; title: string }) {
  return (
    <div className="min-w-0">
      <p className="truncate font-medium text-sm">{title}</p>
      <p className="truncate text-[11px] text-muted-foreground">{meta}</p>
    </div>
  );
}
