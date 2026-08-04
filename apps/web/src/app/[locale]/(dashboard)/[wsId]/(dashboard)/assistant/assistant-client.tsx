'use client';

import { useTranslations } from 'next-intl';
import { type ReactNode, useEffect, useState } from 'react';
import {
  classifyLiveInitializationError,
  type LiveInitializationErrorCode,
  useEphemeralToken,
} from '@/hooks/use-ephemeral-token';
import { LiveAPIProvider } from '@/hooks/use-live-api';
import { VoiceErrorState, VoiceLoadingState } from './assistant-live-state';
import { AssistantVoiceSession } from './assistant-voice-session';

export interface AssistantClientProps {
  creditSource: 'personal' | 'workspace';
  creditWsId?: string;
  onReturnToChat: () => void;
  wsId: string;
}

export default function AssistantClient({
  creditSource,
  creditWsId,
  onReturnToChat,
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
        : effectiveErrorCode === 'MICROPHONE_UNAVAILABLE'
          ? t('microphone_unavailable')
          : effectiveErrorCode === 'NOT_CONFIGURED'
            ? t('not_configured')
            : effectiveErrorCode === 'AUTHORIZATION_EXPIRED'
              ? t('authorization_expired')
              : effectiveErrorCode === 'CONNECTION_FAILED'
                ? t('connection_failed')
                : t('connection_error_fallback');
  const errorTitle =
    effectiveErrorCode === 'INSUFFICIENT_CREDITS'
      ? t('credits_required_title')
      : effectiveErrorCode === 'MICROPHONE_DENIED' ||
          effectiveErrorCode === 'MICROPHONE_UNAVAILABLE'
        ? t('microphone_error_title')
        : effectiveErrorCode === 'NOT_CONFIGURED'
          ? t('not_configured_title')
          : effectiveErrorCode === 'AUTHORIZATION_EXPIRED'
            ? t('session_expired_title')
            : t('unable_to_connect');

  if (isLoading) {
    content = (
      <VoiceLoadingState
        description={t('initializing')}
        privacyNote={t('privacy_note')}
        title={t('preparing_live')}
      />
    );
  } else if (effectiveError || !token || !scopeKey || !liveSessionId) {
    content = (
      <VoiceErrorState
        description={errorDescription}
        note={t('reservation_release_note')}
        onReturnToChat={onReturnToChat}
        onRetry={() => {
          setSessionError(null);
          void refreshToken();
        }}
        retryLabel={t('try_again')}
        returnLabel={t('return_to_chat')}
        title={errorTitle}
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
