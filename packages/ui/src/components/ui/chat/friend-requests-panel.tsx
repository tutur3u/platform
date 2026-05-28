'use client';

import { Check, LoaderCircle, X } from '@tuturuuu/icons';
import type { ChatFriendRequest } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { Avatar, AvatarFallback, AvatarImage } from '../avatar';
import { Button } from '../button';
import { useChatFriendRequests, useRespondChatFriendRequest } from './hooks';
import { getChatInitials } from './utils';

interface FriendRequestsPanelProps {
  currentUserId: string;
  wsId: string;
}

export function FriendRequestsPanel({
  currentUserId,
  wsId,
}: FriendRequestsPanelProps) {
  const t = useTranslations('chat');
  const { data } = useChatFriendRequests(wsId);
  const respond = useRespondChatFriendRequest(wsId);
  const incoming = data?.incoming ?? [];

  if (incoming.length === 0) return null;

  return (
    <div className="border-foreground/10 border-t p-2">
      <div className="mb-2 px-2 font-medium text-muted-foreground text-xs uppercase">
        {t('friend_requests')}
      </div>
      <div className="space-y-1">
        {incoming.map((request) => (
          <FriendRequestRow
            currentUserId={currentUserId}
            isPending={respond.isPending}
            key={request.id}
            onRespond={(status) =>
              respond.mutate({ requestId: request.id, status })
            }
            request={request}
          />
        ))}
      </div>
    </div>
  );
}

function FriendRequestRow({
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
      <div className="flex min-w-0 items-center gap-2">
        <Avatar className="size-8">
          <AvatarImage
            alt={requester.displayName}
            src={requester.avatarUrl ?? undefined}
          />
          <AvatarFallback>{getChatInitials(requester)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium text-sm">
            {requester.displayName}
          </div>
          {requester.handle ? (
            <div className="truncate text-muted-foreground text-xs">
              {requester.handle}
            </div>
          ) : null}
        </div>
      </div>
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
