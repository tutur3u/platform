'use client';

import { Sparkles } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';
import {
  classifyLiveInitializationError,
  type LiveInitializationErrorCode,
  useEphemeralToken,
} from '@/hooks/use-ephemeral-token';
import { LiveAPIProvider } from '@/hooks/use-live-api';
import { AssistantVoiceSession } from './assistant-voice-session';

function VoiceLoadingState({ label }: { label: string }) {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center gap-4 overflow-hidden rounded-lg">
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
    <div className="flex h-full min-h-0 w-full flex-1 flex-col items-center justify-center gap-5 overflow-hidden rounded-lg p-6 text-center">
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
  creditSource: 'personal' | 'workspace';
  creditWsId?: string;
  wsId: string;
}

export default function AssistantClient({
  creditSource,
  creditWsId,
  wsId,
}: AssistantClientProps) {
  const t = useTranslations('dashboard.voice_assistant');
  const [sessionError, setSessionError] = useState<Error | null>(null);
  const {
    token,
    scopeKey,
    isLoading,
    error,
    errorCode,
    expiresAt,
    liveSessionId,
    refreshToken,
  } = useEphemeralToken({ creditSource, creditWsId, wsId });

  useEffect(() => {
    if (error) {
      console.error('[Voice Assistant] Failed to initialize:', error);
    }
  }, [error]);

  let content: ReactNode;

  const effectiveError = sessionError ?? error;
  const effectiveErrorCode: LiveInitializationErrorCode = sessionError
    ? classifyLiveInitializationError(sessionError)
    : errorCode;
  const errorDescription =
    effectiveErrorCode === 'INSUFFICIENT_CREDITS'
      ? t('insufficient_credits')
      : effectiveErrorCode === 'MICROPHONE_DENIED'
        ? t('microphone_denied')
        : effectiveErrorCode === 'NOT_CONFIGURED'
          ? t('not_configured')
          : t('connection_error_fallback');

  if (isLoading) {
    content = <VoiceLoadingState label={t('initializing')} />;
  } else if (effectiveError || !token || !scopeKey || !liveSessionId) {
    content = (
      <VoiceErrorState
        description={errorDescription}
        onRetry={() => {
          setSessionError(null);
          void refreshToken();
        }}
        retryLabel={t('try_again')}
        title={t('unable_to_connect')}
      />
    );
  } else {
    content = (
      <LiveAPIProvider
        key={`${scopeKey}:${token}`}
        apiKey={token}
        authorizationExpiresAt={expiresAt ?? undefined}
        liveSessionId={liveSessionId}
        onAuthorizationExpired={() => {
          setSessionError(new Error('LIVE_AUTHORIZATION_EXPIRED'));
        }}
        wsId={wsId}
        scopeKey={scopeKey}
      >
        <AssistantVoiceSession onError={setSessionError} wsId={wsId} />
      </LiveAPIProvider>
    );
  }

  return (
    <div className="relative flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-lg">
      {content}
    </div>
  );
}
