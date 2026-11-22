'use client';

import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { isMailboxForbidden, retryMailRead } from './mail-read-query';
import { loadMailThreadPage } from './mail-thread-page-query';
import {
  getMailThreadsQueryKey,
  getNextMailThreadPage,
  type MailThreadQueryScope,
} from './mail-thread-query';
import { useMailboxSelection } from './mailbox-selection';

export function useMailThreads(scope: MailThreadQueryScope) {
  const queryClient = useQueryClient();
  const { rejectMailbox } = useMailboxSelection();
  const { mailboxId, folder } = scope;
  const threadsQuery = useInfiniteQuery({
    enabled: Boolean(mailboxId),
    getNextPageParam: getNextMailThreadPage,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      loadMailThreadPage(queryClient, scope, pageParam),
    queryKey: getMailThreadsQueryKey(scope),
    staleTime: 30_000,
    retry: retryMailRead,
    retryOnMount: false,
    refetchInterval: ({ state }) =>
      !isMailboxForbidden(state.error) &&
      (folder === 'inbox' || folder === 'snoozed')
        ? 60_000
        : false,
  });
  const mailboxForbidden = isMailboxForbidden(threadsQuery.error);
  useEffect(() => {
    if (mailboxForbidden && mailboxId) rejectMailbox(mailboxId);
  }, [mailboxForbidden, mailboxId, rejectMailbox]);

  return { threadsQuery, mailboxForbidden };
}
