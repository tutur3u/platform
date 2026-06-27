'use client';

import type { TurnstileInstance } from '@marsidev/react-turnstile';
import { AlertTriangle } from '@tuturuuu/icons/lucide-static';
import { submitRateLimitAppeal } from '@tuturuuu/internal-api';
import { InternalApiError } from '@tuturuuu/internal-api/client';
import { unblockBlockedIp } from '@tuturuuu/internal-api/infrastructure';
import { resolveTurnstileClientState } from '@tuturuuu/turnstile/client';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { toast } from '@tuturuuu/ui/sonner';
import { isExactTuturuuuDotComEmail } from '@tuturuuu/utils/email/client';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type RateLimitDebugDetails,
  setRateLimitDetailsHandler,
} from '@/lib/fetch-interceptor';
import {
  RateLimitAppealRequestSection,
  RateLimitDetailsDialogFooterActions,
} from './rate-limit-details-dialog-actions';
import {
  buildRateLimitDetailSections,
  buildRateLimitHeaderRows,
  formatDetailsForCopy,
  RateLimitDetailRows,
  RateLimitDetailSection,
} from './rate-limit-details-dialog-parts';

export function RateLimitDetailsDialog() {
  const t = useTranslations('common');
  const [details, setDetails] = useState<RateLimitDebugDetails | null>(null);
  const [appealMessage, setAppealMessage] = useState('');
  const [appealReliefExpiresAt, setAppealReliefExpiresAt] = useState<
    string | null
  >(null);
  const [captchaError, setCaptchaError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState<string>();
  const [isClearingIpBlock, setIsClearingIpBlock] = useState(false);
  const [isSubmittingAppeal, setIsSubmittingAppeal] = useState(false);
  const [open, setOpen] = useState(false);
  const turnstileRef = useRef<TurnstileInstance>(null);
  const turnstileState = useMemo(
    () => resolveTurnstileClientState({ requireInDevWhenConfigured: true }),
    []
  );

  const resetAppealState = useCallback(() => {
    setAppealMessage('');
    setAppealReliefExpiresAt(null);
    setCaptchaError(null);
    setCaptchaToken(undefined);
    turnstileRef.current?.reset();
  }, []);

  useEffect(() => {
    const openDetails = (nextDetails: RateLimitDebugDetails) => {
      setDetails(nextDetails);
      resetAppealState();
      setOpen(true);
    };
    const listener = (event: Event) => {
      openDetails((event as CustomEvent<RateLimitDebugDetails>).detail);
    };

    setRateLimitDetailsHandler(openDetails);
    window.addEventListener('tuturuuu:rate-limit-details', listener);

    return () => {
      setRateLimitDetailsHandler(null);
      window.removeEventListener('tuturuuu:rate-limit-details', listener);
    };
  }, [resetAppealState]);

  const sections = useMemo(
    () =>
      details
        ? buildRateLimitDetailSections(details, (key) => t(key as never))
        : [],
    [details, t]
  );
  const headerRows = useMemo(
    () => (details ? buildRateLimitHeaderRows(details) : []),
    [details]
  );
  const canClearIpBlock = useMemo(() => {
    if (!details?.clientIp) {
      return false;
    }

    const isStaffDebugBypass = details.debugBypass === 'tuturuuu-staff';
    const isTuturuuuStaffEmail = isExactTuturuuuDotComEmail(details.userEmail);

    return (
      details.headers['X-Proxy-Block-Reason'] === 'ip-already-blocked' &&
      (isStaffDebugBypass || isTuturuuuStaffEmail)
    );
  }, [details]);
  const canRequestReview = useMemo(() => {
    if (!details?.clientIp || !details.userId || canClearIpBlock) {
      return false;
    }

    return details.headers['X-Proxy-Block-Reason'] === 'ip-already-blocked';
  }, [canClearIpBlock, details]);
  const isAppealSubmitDisabled =
    isSubmittingAppeal ||
    !details ||
    (turnstileState.isRequired &&
      (!turnstileState.canRenderWidget || !captchaToken));

  const copyDetails = async () => {
    if (!details) return;

    try {
      await navigator.clipboard.writeText(formatDetailsForCopy(details));
      toast.success(t('rate_limited_copied'));
    } catch {
      toast.error(t('rate_limited_copy_failed'));
    }
  };

  const requestReview = async () => {
    if (!details || !canRequestReview || isAppealSubmitDisabled) {
      return;
    }

    setIsSubmittingAppeal(true);
    try {
      const diagnostics = JSON.parse(formatDetailsForCopy(details));
      const result = await submitRateLimitAppeal({
        diagnostics,
        message: appealMessage.trim() || undefined,
        turnstileToken: captchaToken,
      });
      setAppealReliefExpiresAt(result.temporaryReliefExpiresAt);
      toast.success(t('rate_limited_appeal_success'));
      turnstileRef.current?.reset();
      setCaptchaToken(undefined);
    } catch (error) {
      toast.error(t('rate_limited_appeal_failed'), {
        description:
          error instanceof InternalApiError
            ? error.message
            : t('rate_limited_appeal_failed_description'),
      });
    } finally {
      setIsSubmittingAppeal(false);
    }
  };

  const clearIpBlock = async () => {
    if (!(details?.clientIp && canClearIpBlock) || isClearingIpBlock) {
      return;
    }

    const proxyBlockReason =
      details.headers['X-Proxy-Block-Reason'] || 'unknown';

    setIsClearingIpBlock(true);
    try {
      await unblockBlockedIp({
        ipAddress: details.clientIp,
        reason: `Cleared from rate-limit details (${proxyBlockReason}) for ${details.requestPath}`,
      });
      toast.success(t('rate_limited_clear_ip_block_success'), {
        description: details.clientIp,
      });
    } catch (error) {
      toast.error(t('rate_limited_clear_ip_block_failed'), {
        description:
          error instanceof InternalApiError
            ? error.message
            : t('rate_limited_clear_ip_block_failed_description'),
      });
    } finally {
      setIsClearingIpBlock(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="grid max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-border border-b px-4 py-4 sm:px-6">
          <DialogTitle>{t('rate_limited_details_title')}</DialogTitle>
          <DialogDescription>
            {t('rate_limited_details_description')}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
          {details?.warning ? (
            <div
              className="mb-5 flex gap-3 rounded-md border border-border bg-muted/40 p-3"
              role="status"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0 space-y-1">
                <p className="font-medium text-sm">
                  {t('rate_limited_debug_warning_title')}
                </p>
                <p className="text-muted-foreground text-sm">
                  {t('rate_limited_debug_warning_description')}
                </p>
              </div>
            </div>
          ) : null}

          {canRequestReview ? (
            <RateLimitAppealRequestSection
              appealMessage={appealMessage}
              appealReliefExpiresAt={appealReliefExpiresAt}
              captchaError={captchaError}
              onCaptchaError={() => {
                setCaptchaError(t('rate_limited_appeal_turnstile_failed'));
                setCaptchaToken(undefined);
              }}
              onCaptchaExpire={() => setCaptchaToken(undefined)}
              onCaptchaSuccess={(token) => {
                setCaptchaError(null);
                setCaptchaToken(token);
              }}
              onMessageChange={setAppealMessage}
              turnstileRef={turnstileRef}
              turnstileState={turnstileState}
            />
          ) : null}

          <div className="space-y-5">
            {sections.map((section) => (
              <RateLimitDetailSection
                key={section.title}
                rows={section.rows}
                title={section.title}
              />
            ))}

            {headerRows.length > 0 ? (
              <details className="border-border border-t pt-5">
                <summary className="cursor-pointer font-medium text-sm">
                  {t('rate_limited_details_sections.headers')}
                </summary>
                <div className="pt-3 opacity-90">
                  <RateLimitDetailRows rows={headerRows} />
                </div>
              </details>
            ) : null}
          </div>
        </div>

        <RateLimitDetailsDialogFooterActions
          canClearIpBlock={canClearIpBlock}
          canRequestReview={canRequestReview}
          isAppealSubmitDisabled={isAppealSubmitDisabled}
          isClearingIpBlock={isClearingIpBlock}
          isSubmittingAppeal={isSubmittingAppeal}
          onClearIpBlock={clearIpBlock}
          onClose={() => setOpen(false)}
          onCopyDetails={copyDetails}
          onRequestReview={requestReview}
        />
      </DialogContent>
    </Dialog>
  );
}
