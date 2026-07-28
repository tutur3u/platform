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
import { memo } from 'react';
import type { CollectionRow } from './repository-collection-types';

export const CollectionRowView = memo(function CollectionRowView({
  row,
}: {
  row: CollectionRow;
}) {
  if (row.kind === 'commit') {
    return (
      <RowLink href={row.href}>
        <GitCommitHorizontal className="h-4 w-4 text-muted-foreground" />
        <RowText meta={row.meta} title={row.title} />
        <code className="text-[11px] text-muted-foreground">
          {row.trailing}
        </code>
      </RowLink>
    );
  }

  if (row.kind === 'issue' || row.kind === 'pull') {
    const isPull = row.kind === 'pull';
    const Icon = isPull ? GitPullRequest : CircleDot;
    return (
      <RowLink href={row.href}>
        <Icon className="h-4 w-4 text-muted-foreground" />
        <div className="min-w-0">
          <p className="truncate font-medium text-sm">{row.title}</p>
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="min-w-0 truncate text-[11px] text-muted-foreground">
              {row.meta}
            </p>
            {row.labels?.length ? (
              <div className="hidden shrink-0 gap-1 overflow-hidden lg:flex">
                {row.labels.map((label) => (
                  <Badge
                    className="h-4 rounded px-1 text-[9px]"
                    key={label}
                    variant="outline"
                  >
                    {label}
                  </Badge>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <Badge className="h-5 text-[10px]" variant="outline">
          {row.state}
        </Badge>
      </RowLink>
    );
  }

  if (row.kind === 'release') {
    return (
      <RowLink href={row.href}>
        <Tag className="h-4 w-4 text-muted-foreground" />
        <RowText meta={row.meta} title={row.title} />
        {row.state === 'pre-release' ? (
          <Badge className="h-5 text-[10px]" variant="outline">
            Pre-release
          </Badge>
        ) : (
          <span />
        )}
      </RowLink>
    );
  }

  if (row.kind === 'run') {
    const Icon =
      row.state === 'success'
        ? CheckCircle2
        : row.state === 'failure'
          ? XCircle
          : row.state === 'in_progress'
            ? Play
            : Clock;
    return (
      <RowLink href={row.href}>
        <Icon className="h-4 w-4 text-muted-foreground" />
        <RowText meta={row.meta} title={row.title} />
        <Badge className="h-5 text-[10px]" variant="outline">
          {row.state}
        </Badge>
      </RowLink>
    );
  }

  if (row.kind === 'contributor') {
    return (
      <RowLink href={row.href}>
        <Avatar className="h-6 w-6">
          <AvatarImage alt="" src={row.avatarUrl} />
          <AvatarFallback>
            <User className="h-3.5 w-3.5" />
          </AvatarFallback>
        </Avatar>
        <RowText meta={row.meta} title={row.title} />
        <span />
      </RowLink>
    );
  }

  return (
    <RowLink href={row.href}>
      <Tag className="h-4 w-4 text-muted-foreground" />
      <RowText meta={row.meta} title={row.title} />
      <span />
    </RowLink>
  );
});

function RowLink({
  children,
  href,
}: {
  children: React.ReactNode;
  href: string;
}) {
  return (
    <Link
      className="grid h-16 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2.5 overflow-hidden px-3 py-2 transition-colors hover:bg-foreground/[0.035]"
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
