'use client';

import { Turnstile, type TurnstileInstance } from '@marsidev/react-turnstile';
import { Copy, Loader2, Shield } from '@tuturuuu/icons/lucide-static';
import type { resolveTurnstileClientState } from '@tuturuuu/turnstile/client';
import { Button } from '@tuturuuu/ui/button';
import { DialogFooter } from '@tuturuuu/ui/dialog';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import type { RefObject } from 'react';

type TurnstileClientState = ReturnType<typeof resolveTurnstileClientState>;

export function RateLimitAppealRequestSection({
  appealMessage,
  appealReliefExpiresAt,
  captchaError,
  onCaptchaError,
  onCaptchaExpire,
  onCaptchaSuccess,
  onMessageChange,
  turnstileRef,
  turnstileState,
}: {
  appealMessage: string;
  appealReliefExpiresAt: string | null;
  captchaError: string | null;
  onCaptchaError: () => void;
  onCaptchaExpire: () => void;
  onCaptchaSuccess: (token: string) => void;
  onMessageChange: (message: string) => void;
  turnstileRef: RefObject<TurnstileInstance | null>;
  turnstileState: TurnstileClientState;
}) {
  const t = useTranslations('common');

  return (
    <section className="mb-5 space-y-3 rounded-md border border-border bg-muted/40 p-3">
      <div className="space-y-1">
        <h3 className="font-medium text-sm">
          {t('rate_limited_appeal_title')}
        </h3>
        <p className="text-muted-foreground text-sm">
          {t('rate_limited_appeal_description')}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="rate-limit-appeal-message">
          {t('rate_limited_appeal_message_label')}
        </Label>
        <Textarea
          id="rate-limit-appeal-message"
          maxLength={2000}
          onChange={(event) => onMessageChange(event.target.value)}
          placeholder={t('rate_limited_appeal_message_placeholder')}
          value={appealMessage}
        />
      </div>

      {turnstileState.isRequired ? (
        <div className="space-y-2">
          {turnstileState.canRenderWidget && turnstileState.siteKey ? (
            <Turnstile
              onError={onCaptchaError}
              onExpire={onCaptchaExpire}
              onSuccess={onCaptchaSuccess}
              onTimeout={onCaptchaExpire}
              ref={turnstileRef}
              siteKey={turnstileState.siteKey}
            />
          ) : (
            <p className="text-destructive text-sm">
              {t('rate_limited_appeal_turnstile_not_configured')}
            </p>
          )}
          {captchaError ? (
            <p className="text-destructive text-sm">{captchaError}</p>
          ) : null}
        </div>
      ) : null}

      {appealReliefExpiresAt ? (
        <p className="text-muted-foreground text-sm" role="status">
          {t('rate_limited_appeal_review_state', {
            expiresAt: appealReliefExpiresAt,
          })}
        </p>
      ) : null}
    </section>
  );
}

export function RateLimitDetailsDialogFooterActions({
  canClearIpBlock,
  canRequestReview,
  isHardIpBlock,
  isAppealSubmitDisabled,
  isClearingIpBlock,
  isSubmittingAppeal,
  onClearIpBlock,
  onClose,
  onCopyDetails,
  onRequestReview,
}: {
  canClearIpBlock: boolean;
  canRequestReview: boolean;
  isHardIpBlock: boolean;
  isAppealSubmitDisabled: boolean;
  isClearingIpBlock: boolean;
  isSubmittingAppeal: boolean;
  onClearIpBlock: () => void;
  onClose: () => void;
  onCopyDetails: () => void;
  onRequestReview: () => void;
}) {
  const t = useTranslations('common');

  const clearButton = canClearIpBlock ? (
    <Button
      aria-label={t('rate_limited_clear_ip_block')}
      disabled={isClearingIpBlock}
      onClick={onClearIpBlock}
      type="button"
      variant="secondary"
    >
      {isClearingIpBlock ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Shield className="h-4 w-4" />
      )}
      {isClearingIpBlock
        ? t('rate_limited_clear_ip_block_loading')
        : t('rate_limited_clear_ip_block')}
    </Button>
  ) : null;
  const reviewButton = canRequestReview ? (
    <Button
      aria-label={t('rate_limited_appeal_submit')}
      disabled={isAppealSubmitDisabled}
      onClick={onRequestReview}
      type="button"
      variant="secondary"
    >
      {isSubmittingAppeal ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Shield className="h-4 w-4" />
      )}
      {isSubmittingAppeal
        ? t('rate_limited_appeal_submitting')
        : t('rate_limited_appeal_submit')}
    </Button>
  ) : null;
  const copyButton = (
    <Button
      aria-label={t('rate_limited_copy_details')}
      onClick={onCopyDetails}
      type="button"
    >
      <Copy className="h-4 w-4" />
      {t('rate_limited_copy_details')}
    </Button>
  );

  return (
    <DialogFooter className="flex-wrap gap-2 border-border border-t bg-background px-4 py-3 max-sm:gap-2 sm:px-6">
      {isHardIpBlock ? copyButton : null}
      {clearButton}
      {reviewButton}
      {isHardIpBlock ? null : copyButton}
      <Button
        aria-label={t('close')}
        onClick={onClose}
        type="button"
        variant="outline"
      >
        {t('close')}
      </Button>
    </DialogFooter>
  );
}
