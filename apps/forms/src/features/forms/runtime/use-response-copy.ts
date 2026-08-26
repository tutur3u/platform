'use client';

import type { TurnstileInstance } from '@marsidev/react-turnstile';
import { type RefObject, useCallback, useState } from 'react';
import type { FormsTranslator } from './types';

/**
 * Emailing a respondent a copy of what they already submitted.
 *
 * Only reachable from the read-only view of an existing response, and gated on
 * Turnstile for the same reason submission is: the endpoint sends mail to an
 * address the caller supplies, so an ungated one is a spam relay.
 */
export function useResponseCopy({
  captchaRef,
  captchaToken,
  isBusy,
  onRequestResponseCopy,
  readOnlyResponseId,
  readOnlyResponseSessionId,
  initialSentTo,
  requiresTurnstile,
  responseCopyEmail,
  setCaptchaToken,
  setError,
  t,
  turnstileSiteKey,
}: {
  captchaRef: RefObject<TurnstileInstance | null>;
  captchaToken: string | undefined;
  isBusy: boolean;
  onRequestResponseCopy?: (payload: {
    responseId: string;
    sessionId: string;
    turnstileToken?: string;
  }) => Promise<{ responseCopySentTo?: string | null } | undefined>;
  readOnlyResponseId?: string | null;
  readOnlyResponseSessionId?: string | null;
  /**
   * Address a copy was already sent to before this render, from the server.
   * Kept separate from local state so a prop change is reflected without an
   * effect that would clobber an address just sent in this session.
   */
  initialSentTo?: string | null;
  requiresTurnstile: boolean;
  responseCopyEmail?: string | null;
  setCaptchaToken: (token: string | undefined) => void;
  setError: (message: string | null) => void;
  t: FormsTranslator;
  turnstileSiteKey?: string;
}) {
  const [isRequesting, setIsRequesting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const resolvedSentTo = sentTo ?? initialSentTo ?? null;

  const requestResponseCopy = useCallback(async () => {
    if (
      isBusy ||
      !onRequestResponseCopy ||
      !readOnlyResponseId ||
      !readOnlyResponseSessionId
    ) {
      return;
    }

    if (requiresTurnstile && !turnstileSiteKey) {
      setError(t('runtime.turnstile_not_configured'));
      return;
    }

    if (requiresTurnstile && !captchaToken) {
      setError(t('runtime.turnstile_required'));
      return;
    }

    setIsRequesting(true);
    setError(null);

    try {
      const result = await onRequestResponseCopy({
        responseId: readOnlyResponseId,
        sessionId: readOnlyResponseSessionId,
        turnstileToken: captchaToken,
      });

      setSentTo(result?.responseCopySentTo ?? responseCopyEmail ?? null);
      // A Turnstile token is single-use, so the widget has to be reset or a
      // second request would fail verification.
      captchaRef.current?.reset();
      setCaptchaToken(undefined);
    } finally {
      setIsRequesting(false);
    }
  }, [
    captchaRef,
    captchaToken,
    isBusy,
    onRequestResponseCopy,
    readOnlyResponseId,
    readOnlyResponseSessionId,
    requiresTurnstile,
    responseCopyEmail,
    setCaptchaToken,
    setError,
    t,
    turnstileSiteKey,
  ]);

  return {
    isRequestingResponseCopy: isRequesting,
    requestResponseCopy,
    responseCopySentTo: resolvedSentTo,
  };
}
