'use client';

import { Check, LoaderCircle, X } from '@tuturuuu/icons';
import type { ChatFriendRequest } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { Avatar, AvatarFallback, AvatarImage } from '../avatar';
import { Button } from '../button';
import { getChatInitials } from './utils';

export function FriendRequestActionRow({
  currentUserId,
  isPending,
  onRespond,
  request,
}: {
  currentUserId: string;
  isPending: boolean;
  onRespond: (status: 'accepted' | 'declined') => void;
  request: ChatFriendRequest;
}) {
  const t = useTranslations('chat');
  const requester =
    request.requesterUserId === currentUserId
      ? request.recipient
      : request.requester;

  return (
    <div className="rounded-md border bg-muted/20 p-2">
      <FriendIdentity user={requester} />
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button
          className="h-8"
          disabled={isPending}
          onClick={() => onRespond('accepted')}
          size="sm"
          type="button"
        >
          {isPending ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <Check className="size-3.5" />
          )}
          {t('accept_friend')}
        </Button>
        <Button
          className="h-8"
          disabled={isPending}
          onClick={() => onRespond('declined')}
          size="sm"
          type="button"
          variant="outline"
        >
          <X className="size-3.5" />
          {t('decline_friend')}
        </Button>
      </div>
    </div>
  );
}

export function FriendStatusRow({
  actionLabel,
  currentUserId,
  isPending,
  onAction,
  request,
}: {
  actionLabel?: string;
  currentUserId: string;
  isPending?: boolean;
  onAction?: () => void;
  request: ChatFriendRequest;
}) {
  const user =
    request.requesterUserId === currentUserId
      ? request.recipient
      : request.requester;

  return (
    <div className="rounded-md border bg-muted/20 p-2">
      <FriendIdentity user={user} />
      {actionLabel && onAction ? (
        <Button
          className="mt-2 h-8 w-full"
          disabled={isPending}
          onClick={onAction}
          size="sm"
          type="button"
          variant="outline"
        >
          {isPending ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <X className="size-3.5" />
          )}
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}

function FriendIdentity({ user }: { user: ChatFriendRequest['requester'] }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-md px-2 py-2">
      <Avatar className="size-8">
        <AvatarImage alt={user.displayName} src={user.avatarUrl ?? undefined} />
        <AvatarFallback>{getChatInitials(user)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium text-sm">{user.displayName}</div>
        {user.handle ? (
          <div className="truncate text-muted-foreground text-xs">
            {user.handle}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function EmptyFriendRequestText({ label }: { label: string }) {
  return <p className="px-2 py-2 text-muted-foreground text-xs">{label}</p>;
}
