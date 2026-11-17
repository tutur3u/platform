'use client';

import { AtSign, EyeOff } from '@tuturuuu/icons';
import { Avatar, AvatarFallback, AvatarImage } from '@tuturuuu/ui/avatar';
import { Badge } from '@tuturuuu/ui/badge';
import { cn } from '@tuturuuu/utils/format';
import { useFormatter, useTranslations } from 'next-intl';
import { findFoldedMatch } from '@/lib/mail/search-fold';
import { mailParticipantInitials } from './mail-participant-avatar';
import { useMailPerson } from './mail-people-resolver';
import type { RecipientSuggestion } from './recipient-ranking';

export function HighlightedText({
  text,
  query,
}: {
  text: string;
  query: string;
}) {
  const match = findFoldedMatch(text, query);
  if (!match) return <>{text}</>;
  return (
    <>
      {match.text.slice(0, match.start)}
      <mark className="rounded-sm bg-dynamic-yellow/25 text-foreground">
        {match.text.slice(match.start, match.end)}
      </mark>
      {match.text.slice(match.end)}
    </>
  );
}

function KindBadge({ kind }: { kind: 'member' | 'contact' }) {
  const t = useTranslations('mail.recipient_suggestions');
  return (
    <Badge
      variant="outline"
      className={cn(
        'shrink-0 font-normal',
        kind === 'member'
          ? 'border-dynamic-blue/30 bg-dynamic-blue/10 text-dynamic-blue'
          : 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green'
      )}
    >
      {t(kind)}
    </Badge>
  );
}

export function RecipientSuggestionRow({
  row,
  query,
  workspaceId,
}: {
  row: RecipientSuggestion;
  query: string;
  workspaceId?: string;
}) {
  const t = useTranslations('mail.recipient_suggestions');
  const format = useFormatter();
  // Recent addresses may belong to a member or contact of this workspace.
  const { data: person } = useMailPerson(
    row.kind === 'recent' ? workspaceId : undefined,
    row.kind === 'recent' ? row.email : null
  );
  const resolvedKind =
    row.kind !== 'recent'
      ? row.kind
      : person?.kind === 'member' || person?.kind === 'contact'
        ? person.kind
        : null;
  const emailHidden =
    !row.email ||
    ((person?.kind === 'member' || person?.kind === 'contact') &&
      !person.emailVisible);
  const name = row.name || person?.displayName || null;
  const title = name ?? (emailHidden ? null : row.email);
  const avatarUrl = row.avatarUrl ?? person?.avatarUrl ?? null;

  return (
    <>
      <Avatar className="size-8 shrink-0" aria-hidden="true">
        {avatarUrl ? (
          <AvatarImage src={avatarUrl} alt="" referrerPolicy="no-referrer" />
        ) : null}
        <AvatarFallback className="bg-muted font-medium text-xs">
          {mailParticipantInitials(name, row.email ?? '')}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1 leading-tight">
        <span className="block truncate font-medium">
          <HighlightedText text={title ?? ''} query={query} />
        </span>
        {!row.email ? (
          <span className="flex items-center gap-1 text-muted-foreground text-xs">
            <EyeOff aria-hidden="true" className="size-3" />
            {t('email_hidden')}
          </span>
        ) : name && !emailHidden ? (
          <span className="block truncate text-muted-foreground text-xs">
            <HighlightedText text={row.email} query={query} />
          </span>
        ) : null}
      </span>
      {resolvedKind ? (
        <KindBadge kind={resolvedKind} />
      ) : row.lastAt ? (
        <span className="shrink-0 text-muted-foreground text-xs">
          {format.relativeTime(new Date(row.lastAt), {
            now: new Date(),
            style: 'narrow',
          })}
        </span>
      ) : null}
    </>
  );
}

export function TypedAddressRow({ address }: { address: string }) {
  const t = useTranslations('mail.recipient_suggestions');
  return (
    <>
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
        <AtSign aria-hidden="true" className="size-4" />
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">
        {t('use_address', { address })}
      </span>
    </>
  );
}
