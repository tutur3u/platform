'use client';

import { useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  MessageSquare,
  RefreshCw,
  Send,
  WifiOff,
} from '@tuturuuu/icons';
import { getExternalChatBindingState } from '@tuturuuu/internal-api';
import { Alert, AlertDescription, AlertTitle } from '@tuturuuu/ui/alert';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

type LabMessage = { body: string; id: string; role: 'visitor' | 'staff' };

export function ExternalChatMigrationLab({ wsId }: { wsId: string }) {
  const t = useTranslations('external-chat-lab');
  const [draft, setDraft] = useState('');
  const [online, setOnline] = useState(true);
  const [messages, setMessages] = useState<LabMessage[]>([
    { body: t('sample_visitor'), id: 'sample-visitor', role: 'visitor' },
    { body: t('sample_staff'), id: 'sample-staff', role: 'staff' },
  ]);
  const state = useQuery({
    queryFn: () => getExternalChatBindingState(wsId),
    queryKey: ['external-chat-binding-state', wsId],
    retry: false,
  });

  function submit() {
    const body = draft.trim();
    if (!body) return;
    setMessages((current) => [
      ...current,
      { body, id: crypto.randomUUID(), role: 'visitor' },
    ]);
    setDraft('');
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 py-2">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
        <div className="min-w-0">
          <h1 className="font-semibold text-2xl">{t('title')}</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground text-sm">
            {t('description')}
          </p>
        </div>
        <Button onClick={() => setOnline((value) => !value)} variant="outline">
          {online ? (
            <CheckCircle2 className="size-4" />
          ) : (
            <WifiOff className="size-4" />
          )}
          {online ? t('connected') : t('outage')}
        </Button>
      </header>

      <Alert
        variant={
          state.isLoading || state.data?.readiness.ready
            ? 'default'
            : 'destructive'
        }
      >
        <MessageSquare className="size-4" />
        <AlertTitle>
          {state.isLoading
            ? t('loading')
            : state.data?.readiness.ready
              ? t('ready')
              : t('prerequisites')}
        </AlertTitle>
        <AlertDescription>
          {state.isLoading
            ? t('loading')
            : state.isError
              ? t('load_error')
              : state.data?.readiness.ready
                ? t('ready_description')
                : t('missing', {
                    count: state.data?.readiness.errors.length ?? 1,
                  })}
        </AlertDescription>
      </Alert>

      <div className="grid min-h-[520px] overflow-hidden border lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex min-h-0 flex-col border-b lg:border-r lg:border-b-0">
          <div className="border-b px-4 py-3">
            <h2 className="font-medium text-sm">{t('widget_preview')}</h2>
            <p className="text-muted-foreground text-xs">
              {t('visitor_surface')}
            </p>
          </div>
          <div className="flex flex-1 flex-col justify-end bg-muted/20 p-4">
            <div className="mx-auto flex h-[430px] w-full max-w-sm flex-col overflow-hidden border bg-background shadow-sm">
              <div className="border-b px-4 py-3">
                <p className="font-medium text-sm">{t('widget_title')}</p>
                <p className="text-muted-foreground text-xs">
                  {online ? t('connected') : t('queueing')}
                </p>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                {messages.map((message) => (
                  <div
                    className={
                      message.role === 'visitor'
                        ? 'ml-8 bg-primary px-3 py-2 text-primary-foreground text-sm'
                        : 'mr-8 border bg-background px-3 py-2 text-sm'
                    }
                    key={message.id}
                  >
                    {message.body}
                  </div>
                ))}
              </div>
              <form
                className="flex gap-2 border-t p-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  submit();
                }}
              >
                <Input
                  aria-label={t('message')}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder={t('message_placeholder')}
                  value={draft}
                />
                <Button aria-label={t('send')} size="icon" type="submit">
                  <Send className="size-4" />
                </Button>
              </form>
            </div>
          </div>
        </section>

        <aside className="p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-sm">{t('checks')}</h2>
            <Button
              aria-label={t('refresh')}
              onClick={() => state.refetch()}
              size="icon"
              variant="ghost"
            >
              <RefreshCw className="size-4" />
            </Button>
          </div>
          <dl className="mt-4 space-y-4 text-sm">
            <Status
              label={t('binding')}
              pending={t('pending')}
              ready={t('ok')}
              value={state.data?.enabled === true}
            />
            <Status
              label={t('ingest_secret')}
              pending={t('pending')}
              ready={t('ok')}
              value={Boolean(state.data?.secrets.ingest.configured)}
            />
            <Status
              label={t('control_secret')}
              pending={t('pending')}
              ready={t('ok')}
              value={Boolean(state.data?.secrets.control.configured)}
            />
            <Status
              label={t('legacy_routes')}
              pending={t('pending')}
              ready={t('ok')}
              value
            />
            <Status
              label={t('authority')}
              pending={t('pending')}
              value={
                state.data?.settings?.authorityMode !== 'legacy_primary' &&
                Boolean(state.data?.settings?.authorityMode)
              }
              pendingLabel={t('legacy_primary')}
              ready={t('ok')}
            />
          </dl>
        </aside>
      </div>
    </div>
  );
}

function Status({
  label,
  pending,
  pendingLabel,
  ready,
  value,
}: {
  label: string;
  pending: string;
  pendingLabel?: string;
  ready: string;
  value: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b pb-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">
        {value ? ready : (pendingLabel ?? pending)}
      </dd>
    </div>
  );
}
