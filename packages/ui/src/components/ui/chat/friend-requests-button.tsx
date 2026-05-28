'use client';

import { LoaderCircle, UserPlus } from '@tuturuuu/icons';
import type { ChatFriendRequests } from '@tuturuuu/internal-api';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useState } from 'react';
import { Badge } from '../badge';
import { Button } from '../button';
import { Input } from '../input';
import { Popover, PopoverContent, PopoverTrigger } from '../popover';
import { toast } from '../sonner';
import {
  EmptyFriendRequestText,
  FriendRequestActionRow,
  FriendStatusRow,
} from './friend-request-items';
import {
  useChatFriendRequests,
  useCreateChatFriendRequest,
  useRespondChatFriendRequest,
  useRevokeChatFriendRequest,
} from './hooks';

interface FriendRequestsButtonProps {
  className?: string;
  currentUserId: string;
  wsId: string;
}

export function FriendRequestsButton({
  className,
  currentUserId,
  wsId,
}: FriendRequestsButtonProps) {
  const t = useTranslations('chat');
  const { data, isFetching } = useChatFriendRequests(wsId);
  const createFriendRequest = useCreateChatFriendRequest(wsId);
  const respond = useRespondChatFriendRequest(wsId);
  const revoke = useRevokeChatFriendRequest(wsId);
  const incomingCount = data?.incoming.length ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          aria-label={t('friend_requests')}
          className={cn('relative shrink-0', className)}
          size="icon"
          type="button"
          variant="outline"
        >
          {isFetching ? (
            <LoaderCircle className="size-4 animate-spin" />
          ) : (
            <UserPlus className="size-4" />
          )}
          {incomingCount > 0 ? (
            <Badge className="absolute -top-2 -right-2 h-5 min-w-5 px-1 text-[10px]">
              {incomingCount}
            </Badge>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <FriendRequestsContent
          createFriendRequest={(email) =>
            createFriendRequest.mutateAsync(email)
          }
          currentUserId={currentUserId}
          data={data}
          isCreating={createFriendRequest.isPending}
          isPending={respond.isPending || revoke.isPending}
          onRevoke={(requestId) => revoke.mutate(requestId)}
          onRespond={(requestId, status) =>
            respond.mutate({ requestId, status })
          }
        />
      </PopoverContent>
    </Popover>
  );
}

function FriendRequestsContent({
  createFriendRequest,
  currentUserId,
  data,
  isCreating,
  isPending,
  onRevoke,
  onRespond,
}: {
  createFriendRequest: (email: string) => Promise<unknown>;
  currentUserId: string;
  data?: ChatFriendRequests;
  isCreating: boolean;
  isPending: boolean;
  onRevoke: (requestId: string) => void;
  onRespond: (requestId: string, status: 'accepted' | 'declined') => void;
}) {
  const t = useTranslations('chat');
  const incoming = data?.incoming ?? [];
  const outgoing = data?.outgoing ?? [];
  const accepted = data?.accepted ?? [];

  return (
    <div className="min-w-0">
      <div className="border-b px-3 py-2">
        <p className="font-medium text-sm">{t('friend_requests')}</p>
        <p className="text-muted-foreground text-xs">
          {t('friend_requests_description')}
        </p>
      </div>
      <FriendRequestComposer
        isCreating={isCreating}
        onCreate={createFriendRequest}
      />
      <div className="max-h-96 overflow-y-auto p-2">
        <FriendRequestSection title={t('incoming_friend_requests')}>
          {incoming.length > 0 ? (
            incoming.map((request) => (
              <FriendRequestActionRow
                currentUserId={currentUserId}
                isPending={isPending}
                key={request.id}
                onRespond={(status) => onRespond(request.id, status)}
                request={request}
              />
            ))
          ) : (
            <EmptyFriendRequestText label={t('no_incoming_friend_requests')} />
          )}
        </FriendRequestSection>

        <FriendRequestSection title={t('sent_friend_requests')}>
          {outgoing.length > 0 ? (
            outgoing.map((request) => (
              <FriendStatusRow
                actionLabel={t('revoke_friend_request')}
                currentUserId={currentUserId}
                isPending={isPending}
                key={request.id}
                onAction={() => onRevoke(request.id)}
                request={request}
              />
            ))
          ) : (
            <EmptyFriendRequestText label={t('no_sent_friend_requests')} />
          )}
        </FriendRequestSection>

        <FriendRequestSection title={t('friends')}>
          {accepted.length > 0 ? (
            accepted.map((request) => (
              <FriendStatusRow
                currentUserId={currentUserId}
                key={request.id}
                request={request}
              />
            ))
          ) : (
            <EmptyFriendRequestText label={t('no_friends_yet')} />
          )}
        </FriendRequestSection>
      </div>
    </div>
  );
}

function FriendRequestComposer({
  isCreating,
  onCreate,
}: {
  isCreating: boolean;
  onCreate: (email: string) => Promise<unknown>;
}) {
  const t = useTranslations('chat');
  const [email, setEmail] = useState('');
  const trimmedEmail = email.trim();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmedEmail) return;

    try {
      await onCreate(trimmedEmail);
      setEmail('');
      toast.success(t('friend_request_sent'));
    } catch {
      toast.error(t('friend_request_failed'));
    }
  }

  return (
    <form className="grid gap-2 border-b p-3" onSubmit={handleSubmit}>
      <label className="font-medium text-xs" htmlFor="friend-request-email">
        {t('add_friend_by_email')}
      </label>
      <div className="flex min-w-0 gap-2">
        <Input
          autoComplete="email"
          className="h-9 min-w-0"
          disabled={isCreating}
          id="friend-request-email"
          onChange={(event) => setEmail(event.target.value)}
          placeholder={t('friend_email_placeholder')}
          type="email"
          value={email}
        />
        <Button
          className="h-9 shrink-0"
          disabled={isCreating || !trimmedEmail}
          size="sm"
          type="submit"
        >
          {isCreating ? (
            <LoaderCircle className="size-3.5 animate-spin" />
          ) : (
            <UserPlus className="size-3.5" />
          )}
          {t('send_friend_request')}
        </Button>
      </div>
    </form>
  );
}

function FriendRequestSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="space-y-1 py-1">
      <h3 className="px-2 font-medium text-muted-foreground text-xs uppercase">
        {title}
      </h3>
      {children}
    </section>
  );
}
