'use client';

import { ArrowLeft, Sparkles } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useEphemeralToken } from '@/hooks/use-ephemeral-token';
import { LiveAPIProvider } from '@/hooks/use-live-api';
import { AssistantVoiceSession } from './assistant-voice-session';

function VoiceLoadingState({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center gap-4 overflow-hidden rounded-lg bg-background">
      <div className="grid size-20 animate-pulse place-items-center rounded-full bg-dynamic-purple/15">
        <Sparkles className="size-8 text-dynamic-purple" />
      </div>
      <p className="text-muted-foreground text-sm">{label}</p>
    </div>
  );
}

function VoiceErrorState({
  description,
  onRetry,
  retryLabel,
  title,
}: {
  description: string;
  onRetry: () => void;
  retryLabel: string;
  title: string;
}) {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center gap-5 overflow-hidden rounded-lg bg-background p-6 text-center">
      <div className="grid size-16 place-items-center rounded-full bg-destructive/10">
        <Sparkles className="size-7 text-destructive" />
      </div>
      <div>
        <h2 className="font-semibold text-xl">{title}</h2>
        <p className="mt-2 max-w-sm text-muted-foreground text-sm">
          {description}
        </p>
      </div>
      <Button onClick={onRetry}>{retryLabel}</Button>
    </div>
  );
}

export interface AssistantClientProps {
  onExit: () => void;
  wsId: string;
}

export default function AssistantClient({
  onExit,
  wsId,
}: AssistantClientProps) {
  const t = useTranslations('dashboard.voice_assistant');
  const { token, scopeKey, isLoading, error, refreshToken } =
    useEphemeralToken(wsId);

  let content: ReactNode;

  if (isLoading) {
    content = <VoiceLoadingState label={t('initializing')} />;
  } else if (error || !token || !scopeKey) {
    content = (
      <VoiceErrorState
        description={error?.message || t('connection_error_fallback')}
        onRetry={() => refreshToken()}
        retryLabel={t('try_again')}
        title={t('unable_to_connect')}
      />
    );
  } else {
    content = (
      <LiveAPIProvider
        key={`${scopeKey}:${token}`}
        apiKey={token}
        wsId={wsId}
        scopeKey={scopeKey}
      >
        <AssistantVoiceSession wsId={wsId} />
      </LiveAPIProvider>
    );
  }

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-lg">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="absolute top-3 left-3 z-50 gap-2 shadow-lg"
        onClick={onExit}
        aria-label={t('back_to_chat')}
      >
        <ArrowLeft className="size-4" />
        <span className="hidden sm:inline">{t('back_to_chat')}</span>
      </Button>
      {content}
    </div>
  );
}
