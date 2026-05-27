'use client';

import {
  Bot,
  CheckCircle2,
  LoaderCircle,
  MessageCircle,
  ShieldCheck,
  Users,
} from '@tuturuuu/icons';
import type { ChatConversation } from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { Badge } from '../badge';
import { Button } from '../button';
import { Separator } from '../separator';

export function ChatHeader({
  conversation,
  currentUserId,
  isFetching,
  title,
}: {
  conversation: ChatConversation | null;
  currentUserId: string;
  isFetching?: boolean;
  title: string;
}) {
  const t = useTranslations('chat');
  const otherMembers =
    conversation?.members.filter((member) => member.userId !== currentUserId) ??
    [];

  return (
    <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b px-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="truncate font-semibold text-base">{title}</h1>
          {conversation?.aiEnabled && (
            <Badge variant="secondary">
              <Bot className="size-3" />
              {t('ai_badge')}
            </Badge>
          )}
          {conversation?.type === 'channel' && (
            <Badge variant="outline">{t('channel_badge')}</Badge>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-2 text-muted-foreground text-xs">
          <ShieldCheck className="size-3.5" />
          <span>{t('private_schema_status')}</span>
          {conversation && (
            <>
              <Separator className="h-3" orientation="vertical" />
              <Users className="size-3.5" />
              <span>
                {t('member_count', { count: conversation.memberCount })}
              </span>
            </>
          )}
          {otherMembers.length > 0 && (
            <>
              <Separator className="h-3" orientation="vertical" />
              <span className="truncate">
                {otherMembers
                  .slice(0, 3)
                  .map((member) => member.user.displayName)
                  .join(', ')}
              </span>
            </>
          )}
        </div>
      </div>

      {isFetching && (
        <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" />
      )}
    </header>
  );
}

export function EmptyConversationState({ onCreate }: { onCreate: () => void }) {
  const t = useTranslations('chat');

  return (
    <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center">
      <div className="max-w-sm">
        <MessageCircle className="mx-auto mb-3 size-10 text-muted-foreground" />
        <h2 className="font-semibold">{t('empty_conversations_title')}</h2>
        <p className="mt-1 text-muted-foreground text-sm">
          {t('empty_conversations_description')}
        </p>
        <Button className="mt-4" onClick={onCreate} type="button">
          <CheckCircle2 className="size-4" />
          {t('new_conversation')}
        </Button>
      </div>
    </div>
  );
}
