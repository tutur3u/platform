'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MessageSquare } from '@tuturuuu/icons';
import type { ChatConversation } from '@tuturuuu/internal-api/chat';
import { LoadingRegion, SkeletonList } from '@tuturuuu/ui/skeleton';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  loadPersonalChat,
  type PersonalTabSnapshot,
  type PersonalToolsApi,
  type PersonalToolsSnapshot,
  personalToolsApi,
  personalToolsFailureKeepsSnapshot,
} from '../../lib/personal-tools';
import {
  PersonalAppLinkButton,
  PersonalSearchInput,
  resolveSafePersonalAppUrl,
} from './shared';

function conversationLabel(
  conversation: ChatConversation,
  fallback: string
): string {
  if (conversation.title?.trim()) return conversation.title.trim();
  const names = conversation.members
    .map((member) => member.user.displayName)
    .filter(Boolean);
  return names.length ? names.join(', ') : fallback;
}

export function PersonalChatTab({
  accountId,
  workspace,
  active,
  api = personalToolsApi,
}: {
  accountId: string;
  workspace: PersonalToolsSnapshot['workspace'];
  active: boolean;
  api?: PersonalToolsApi;
}) {
  const t = useTranslations('meet.call.private_tools');
  const cache = useQueryClient();
  const [search, setSearch] = useState('');
  const queryKey = [
    'meet-personal-tools',
    accountId,
    workspace.id,
    'chat',
  ] as const;

  const query = useQuery({
    queryKey,
    enabled: active,
    queryFn: () =>
      loadPersonalChat(
        accountId,
        workspace.id,
        api,
        cache.getQueryData<PersonalTabSnapshot<ChatConversation[]>>(queryKey)
      ),
    gcTime: 0,
    staleTime: 30_000,
    refetchInterval: active ? 60_000 : false,
    retry: false,
  });

  const isTransientError =
    query.isError && personalToolsFailureKeepsSnapshot(query.error);
  const snapshot = query.isError && !isTransientError ? null : query.data;
  const isStale =
    snapshot?.status === 'stale' ||
    (isTransientError && Boolean(snapshot?.items));
  const href = resolveSafePersonalAppUrl('chat', workspace);

  const filtered = useMemo(() => {
    const items = snapshot?.items;
    if (!items) return null;
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => {
      const label = conversationLabel(item, t('untitled_chat')).toLowerCase();
      const preview = item.latestMessage?.content?.toLowerCase() ?? '';
      return label.includes(term) || preview.includes(term);
    });
  }, [search, snapshot?.items, t]);

  return (
    <div>
      <PersonalAppLinkButton href={href} label={t('open_chat')} />
      <PersonalSearchInput
        value={search}
        onChange={setSearch}
        placeholder={t('search_chat_placeholder')}
      />
      {query.isPending ? (
        <LoadingRegion srLabel={t('loading_tab')} className="space-y-2">
          <SkeletonList rows={3} withAvatar={false} />
        </LoadingRegion>
      ) : !snapshot || snapshot.status === 'unavailable' || !filtered ? (
        <p role="status" className="text-muted-foreground text-sm">
          {t('tab_unavailable')}
        </p>
      ) : (
        <>
          {isStale && (
            <p role="status" className="mb-2 text-muted-foreground text-xs">
              {t('stale_chat')}
            </p>
          )}
          {!snapshot.items?.length ? (
            <p className="text-muted-foreground text-sm">{t('empty_chat')}</p>
          ) : !filtered.length ? (
            <p className="text-muted-foreground text-sm">{t('no_matches')}</p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((conversation) => (
                <li
                  key={conversation.id}
                  className="flex items-start gap-2 rounded-lg px-2 py-2.5"
                >
                  <MessageSquare className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm">
                      {conversationLabel(conversation, t('untitled_chat'))}
                    </p>
                    {conversation.latestMessage?.content && (
                      <p className="mt-0.5 truncate text-muted-foreground text-xs">
                        {conversation.latestMessage.content}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
