'use client';

import type { WorkspaceUser } from '@tuturuuu/types/primitives/WorkspaceUser';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { RequireAttentionName } from '@tuturuuu/users-ui/components/require-attention-name';
import { normalizeAvatarImageSrc } from '@tuturuuu/utils/avatar-url';
import { cn } from '@tuturuuu/utils/format';
import Link from 'next/link';
import { ContactNote, type ContactNoteLabels } from './contact-note';
import { UserAvatarCell } from './user-avatar-cell';

export function ContactIdentityCell({
  user,
  preferDisplayName = false,
  hasPrivateInfo,
  labels,
}: {
  user: WorkspaceUser;
  preferDisplayName?: boolean;
  hasPrivateInfo: boolean;
  labels: ContactNoteLabels & {
    linked: string;
    virtual: string;
    linkedTo: string;
  };
}) {
  const primaryName = preferDisplayName
    ? user.display_name || user.full_name || '-'
    : user.full_name || user.display_name || '-';
  const alternateName = preferDisplayName ? user.full_name : user.display_name;
  const linkedUsers = Array.isArray(user.linked_users) ? user.linked_users : [];
  const isLinked = linkedUsers.length > 0;
  const name = (
    <span className="min-w-0 font-semibold leading-snug [overflow-wrap:anywhere]">
      <RequireAttentionName
        name={primaryName}
        requireAttention={!!user.has_require_attention_feedback}
      />
    </span>
  );
  const identity = (
    <>
      {!preferDisplayName && (
        <UserAvatarCell
          avatarUrl={normalizeAvatarImageSrc(user.avatar_url)}
          name={primaryName}
        />
      )}
      <span className="min-w-0 flex-1">
        {name}
        {alternateName && alternateName !== primaryName && (
          <span className="mt-0.5 block text-muted-foreground text-xs [overflow-wrap:anywhere]">
            {alternateName}
          </span>
        )}
      </span>
    </>
  );
  const identityLink = user.href ? (
    <Link
      href={user.href}
      className="flex min-w-0 items-start gap-2.5 rounded-md transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      {identity}
    </Link>
  ) : (
    <div className="flex min-w-0 items-start gap-2.5">{identity}</div>
  );

  return (
    <div className="w-64 max-w-[calc(100vw-5rem)] whitespace-normal py-1">
      {isLinked && user.href ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>{identityLink}</TooltipTrigger>
            <TooltipContent>
              <p className="font-medium">{labels.linkedTo}</p>
              <ul>
                {linkedUsers.map((linkedUser) => (
                  <li key={linkedUser.id}>{linkedUser.display_name || '-'}</li>
                ))}
              </ul>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        identityLink
      )}
      {!preferDisplayName && (
        <span
          className={cn(
            'mt-1.5 inline-flex rounded border px-1.5 py-0.5 font-medium text-[10px]',
            isLinked
              ? 'border-dynamic-green/30 bg-dynamic-green/10 text-dynamic-green'
              : 'border-border bg-muted/40 text-muted-foreground'
          )}
        >
          {isLinked ? labels.linked : labels.virtual}
        </span>
      )}
      {hasPrivateInfo && <ContactNote note={user.note} labels={labels} />}
    </div>
  );
}
