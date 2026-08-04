'use client';

import { useQuery } from '@tanstack/react-query';
import { LoaderCircle, MapPin } from '@tuturuuu/icons';
import {
  type ExternalChatConversationContext,
  getExternalChatConversationContext,
} from '@tuturuuu/internal-api';
import { useTranslations } from 'next-intl';
import { ScrollArea } from '../scroll-area';
import { formatChatTime } from './utils';

export function ChatExternalContextSidebar({
  conversationId,
  open,
  wsId,
}: {
  conversationId?: string | null;
  open: boolean;
  wsId: string;
}) {
  const t = useTranslations('chat');
  const query = useQuery({
    enabled: open && Boolean(conversationId),
    queryFn: () =>
      getExternalChatConversationContext(wsId, conversationId as string),
    queryKey: ['chat', wsId, conversationId, 'external-context'],
  });
  if (!open) return null;
  return (
    <aside className="hidden w-80 min-w-0 shrink-0 overflow-hidden border-l bg-background md:flex md:flex-col">
      <div className="border-b p-3">
        <h2 className="font-semibold text-sm">{t('visitor_context')}</h2>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        {query.isLoading ? (
          <div className="flex items-center justify-center p-6 text-muted-foreground text-sm">
            <LoaderCircle className="mr-2 size-4 animate-spin" />
            {t('loading_visitor_context')}
          </div>
        ) : query.data ? (
          <ContextContent context={query.data} />
        ) : (
          <p className="p-4 text-muted-foreground text-sm">
            {t('visitor_context_unavailable')}
          </p>
        )}
      </ScrollArea>
    </aside>
  );
}

function ContextContent({
  context,
}: {
  context: ExternalChatConversationContext;
}) {
  const t = useTranslations('chat');
  return (
    <div className="space-y-5 p-4">
      <dl className="space-y-3">
        <Detail label={t('visitor_name')} value={context.profile.displayName} />
        <Detail label={t('visitor_phone')} value={context.profile.phone} />
        <Detail label={t('visitor_email')} value={context.profile.email} />
        <Detail label={t('network_hint')} value={context.networkHint} />
        <Detail
          label={t('first_activity')}
          value={formatChatTime(context.firstActivityAt)}
        />
        <Detail
          label={t('last_activity')}
          value={formatChatTime(context.lastActivityAt)}
        />
      </dl>
      <section>
        <h3 className="font-semibold text-muted-foreground text-xs uppercase">
          {t('visited_routes')}
        </h3>
        <div className="mt-2 space-y-2">
          {context.routes.length ? (
            context.routes.map((route) => (
              <div
                className="flex gap-2 border-l-2 pl-3 text-sm"
                key={`${route.occurredAt}:${route.location}`}
              >
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="break-all">{route.location}</p>
                  <p className="text-muted-foreground text-xs">
                    {formatChatTime(route.occurredAt)}
                  </p>
                </div>
              </div>
            ))
          ) : (
            <p className="text-muted-foreground text-sm">
              {t('no_visited_routes')}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className="mt-0.5 break-words text-sm">{value || '-'}</dd>
    </div>
  );
}
