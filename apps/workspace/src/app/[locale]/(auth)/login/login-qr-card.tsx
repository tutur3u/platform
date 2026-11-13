'use client';

import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { useQuery } from '@tanstack/react-query';
import { QrCode, RefreshCw, Smartphone } from '@tuturuuu/icons/lucide-static';
import {
  createQrLoginChallengeWithInternalApi,
  pollQrLoginChallengeWithInternalApi,
  type QrLoginSessionPayload,
} from '@tuturuuu/internal-api/auth';
import { Button } from '@tuturuuu/ui/button';
import { LoadingIndicator } from '@tuturuuu/ui/custom/loading-indicator';
import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getTurnstileClientErrorMessageKey,
  shouldRetryTurnstileClientError,
} from './turnstile-state';

const CAPTCHA_ERROR_RETRY_DELAY = 3000;

interface LoginQrCardProps {
  canRenderTurnstile?: boolean;
  disabled?: boolean;
  locale: string;
  onAuthenticated: (session: QrLoginSessionPayload) => Promise<void>;
  requiresTurnstile?: boolean;
  turnstileSiteKey?: string;
}

function readSecretFromPayload(payload?: string) {
  if (!payload) {
    return null;
  }

  try {
    return new URL(payload).searchParams.get('secret');
  } catch {
    return null;
  }
}

export function LoginQrCard({
  canRenderTurnstile = false,
  disabled = false,
  locale,
  onAuthenticated,
  requiresTurnstile = false,
  turnstileSiteKey,
}: LoginQrCardProps) {
  const t = useTranslations();
  const [captchaToken, setCaptchaToken] = useState<string>();
  const [captchaTokenVersion, setCaptchaTokenVersion] = useState(0);
  const [captchaError, setCaptchaError] = useState<string>();
  const [refreshIndex, setRefreshIndex] = useState(0);
  const turnstileRef = useRef<TurnstileInstance>(null);
  const handledSessionRef = useRef(false);
  const canCreateChallenge = !requiresTurnstile || Boolean(captchaToken);

  const resetTurnstile = useCallback(() => {
    setCaptchaToken(undefined);
    turnstileRef.current?.reset();
  }, []);

  const handleCaptchaSuccess = useCallback((token: string) => {
    setCaptchaToken(token);
    setCaptchaTokenVersion((value) => value + 1);
    setCaptchaError(undefined);
  }, []);

  const handleCaptchaError = useCallback(
    (errorCode?: string) => {
      resetTurnstile();
      setCaptchaError(
        t(`login.${getTurnstileClientErrorMessageKey(errorCode)}`)
      );

      if (shouldRetryTurnstileClientError(errorCode)) {
        window.setTimeout(() => {
          resetTurnstile();
          setCaptchaError(undefined);
        }, CAPTCHA_ERROR_RETRY_DELAY);
      }
    },
    [resetTurnstile, t]
  );

  const handleCaptchaTimeout = useCallback(() => {
    resetTurnstile();
  }, [resetTurnstile]);

  const challengeQuery = useQuery({
    enabled: canCreateChallenge && !disabled,
    queryFn: () => {
      const payload = {
        captchaToken,
        locale,
        origin: window.location.origin,
      };

      return createQrLoginChallengeWithInternalApi(payload);
    },
    queryKey: [
      'auth',
      'qr-login',
      'challenge',
      locale,
      captchaTokenVersion,
      refreshIndex,
    ],
    refetchOnWindowFocus: false,
    retry: false,
  });

  const challenge = challengeQuery.data?.challenge ?? null;
  const secret = useMemo(
    () => readSecretFromPayload(challenge?.payload),
    [challenge?.payload]
  );

  const pollQuery = useQuery({
    enabled:
      Boolean(challenge?.id && secret) &&
      !handledSessionRef.current &&
      !disabled,
    queryFn: () =>
      pollQrLoginChallengeWithInternalApi({
        challengeId: challenge?.id || '',
        secret: secret || '',
      }),
    queryKey: ['auth', 'qr-login', 'poll', challenge?.id, secret],
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status || status === 'pending') {
        return 2000;
      }
      return false;
    },
    refetchOnWindowFocus: true,
    retry: false,
  });

  const session = pollQuery.data?.session;

  useEffect(() => {
    if (!session || handledSessionRef.current) {
      return;
    }

    handledSessionRef.current = true;
    void onAuthenticated(session);
  }, [onAuthenticated, session]);

  const refreshChallenge = useCallback(() => {
    handledSessionRef.current = false;
    setCaptchaError(undefined);

    if (requiresTurnstile) {
      resetTurnstile();
      return;
    }

    setRefreshIndex((value) => value + 1);
  }, [requiresTurnstile, resetTurnstile]);

  const status = pollQuery.data?.status ?? challenge?.status;
  const isExpired = status === 'expired' || status === 'consumed';
  const isApproving = status === 'approved' && !session;
  const isLoading = challengeQuery.isLoading || challengeQuery.isFetching;
  const hasError =
    challengeQuery.isError ||
    pollQuery.isError ||
    challengeQuery.data?.error ||
    pollQuery.data?.error;

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <QrCode className="size-5" />
        </div>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="font-medium text-sm">{t('login.qr_title')}</p>
          <p className="text-muted-foreground text-xs leading-5">
            {t('login.qr_description')}
          </p>
        </div>
      </div>

      {requiresTurnstile ? (
        <div className="rounded-2xl bg-transparent py-1">
          {canRenderTurnstile && turnstileSiteKey ? (
            <div className="flex flex-col items-center gap-2">
              <Turnstile
                ref={turnstileRef}
                siteKey={turnstileSiteKey}
                onSuccess={handleCaptchaSuccess}
                onExpire={() => setCaptchaToken(undefined)}
                onError={handleCaptchaError}
                onTimeout={handleCaptchaTimeout}
              />
              {captchaError ? (
                <p className="text-destructive text-sm">{captchaError}</p>
              ) : null}
            </div>
          ) : (
            <p className="text-destructive text-sm">
              {t('login.captcha_not_configured')}
            </p>
          )}
        </div>
      ) : null}

      <div className="mt-4 flex flex-col items-center gap-3">
        <div className="flex size-48 items-center justify-center rounded-2xl border border-border/60 bg-background p-3">
          {!canCreateChallenge ? (
            <div className="space-y-2 text-center">
              <p className="font-medium text-sm">
                {t('login.qr_turnstile_title')}
              </p>
              <p className="text-muted-foreground text-xs">
                {t('login.qr_turnstile_description')}
              </p>
            </div>
          ) : isLoading ? (
            <LoadingIndicator className="size-6" />
          ) : hasError || !challenge?.payload || !secret ? (
            <div className="space-y-2 text-center">
              <p className="font-medium text-destructive text-sm">
                {t('login.qr_unavailable_title')}
              </p>
              <p className="text-muted-foreground text-xs">
                {t('login.qr_unavailable_description')}
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={refreshChallenge}
                disabled={disabled}
              >
                <RefreshCw className="size-4" />
                <span>{t('login.qr_refresh')}</span>
              </Button>
            </div>
          ) : isExpired ? (
            <div className="space-y-2 text-center">
              <p className="font-medium text-sm">{t('login.qr_expired')}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={refreshChallenge}
                disabled={disabled}
              >
                <RefreshCw className="size-4" />
                <span>{t('login.qr_refresh')}</span>
              </Button>
            </div>
          ) : (
            <QRCodeSVG
              value={challenge.payload}
              size={168}
              level="M"
              marginSize={1}
            />
          )}
        </div>

        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          {isApproving || session ? (
            <>
              <LoadingIndicator className="size-3.5" />
              <span>{t('login.qr_approving')}</span>
            </>
          ) : (
            <>
              <Smartphone className="size-3.5" />
              <span>{t('login.qr_scan_hint')}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
