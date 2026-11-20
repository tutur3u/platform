'use client';

import { Lock } from '@tuturuuu/icons';
import type { LiveBlockReason } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useLocale, useTranslations } from 'next-intl';
import type { LiveEntryState } from '@/hooks/use-live-eligibility';
import { getPayBillingUrl } from '@/lib/pay-app-url';
import { AuroraBlob } from '../assistant-visuals';

type BlockedEligibility = Extract<
  LiveEntryState,
  { status: 'blocked' }
>['eligibility'];

const PLAN_KEYS = {
  PLUS: 'plan_plus',
  PRO: 'plan_pro',
  ENTERPRISE: 'plan_enterprise',
} as const;

/** Reasons that point at billing; the others only acknowledge. */
const BILLING_ACTION: Partial<Record<LiveBlockReason, 'upgrade' | 'top_up'>> = {
  plan_required: 'upgrade',
  credits_exhausted: 'top_up',
};

export function formatLiveResetTime(
  resetAt: string | undefined,
  locale: string,
  now = new Date()
) {
  if (!resetAt) return null;
  const date = new Date(resetAt);
  if (Number.isNaN(date.getTime())) return null;
  const sameDay = date.toDateString() === now.toDateString();
  return new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    minute: '2-digit',
    ...(sameDay ? {} : { month: 'short', day: 'numeric' }),
  }).format(date);
}

export function LiveBlockedDialog({
  billingWsId,
  eligibility,
  onOpenChange,
  open,
}: {
  /** Workspace whose billing page Upgrade and Top up open. */
  billingWsId: string;
  eligibility: BlockedEligibility;
  onOpenChange: (open: boolean) => void;
  open: boolean;
}) {
  const t = useTranslations('dashboard.voice_assistant.live_blocked');
  const locale = useLocale();
  const { reason, params, billing } = eligibility;
  const action = BILLING_ACTION[reason];
  const number = new Intl.NumberFormat(locale);
  const resetTime = formatLiveResetTime(params.resetAt, locale);

  const body =
    reason === 'credits_exhausted'
      ? t('credits_exhausted.body', {
          balance: number.format(params.balance ?? 0),
          minimum: number.format(params.minimumCredits ?? 0),
        })
      : reason === 'limit_reached'
        ? resetTime
          ? t('limit_reached.body', { time: resetTime })
          : t('limit_reached.body_later')
        : t(`${reason}.body`);
  const plans = params.plans.flatMap((plan) => {
    const key = PLAN_KEYS[plan as keyof typeof PLAN_KEYS];
    return key ? [t(key)] : [];
  });
  const billedTo = billing
    ? (billing.name ?? (billing.personal ? t('personal_workspace') : null))
    : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="gap-5 sm:max-w-sm"
        data-reason={reason}
      >
        <div className="@container grid w-full place-items-center pt-2">
          <div className="relative">
            <AuroraBlob
              connected={false}
              isSpeaking={false}
              isUserSpeaking={false}
              volume={0}
            />
            <span className="absolute right-1 bottom-1 grid size-8 place-items-center rounded-full border border-border bg-background shadow-sm">
              <Lock aria-hidden className="size-4 text-muted-foreground" />
            </span>
          </div>
        </div>
        <DialogHeader className="items-center text-center sm:text-center">
          <DialogTitle className="text-balance leading-snug">
            {t(`${reason}.title`)}
          </DialogTitle>
          <DialogDescription className="text-pretty">{body}</DialogDescription>
        </DialogHeader>

        {reason === 'plan_required' && plans.length > 0 ? (
          <ul
            aria-label={t('plans_label')}
            className="flex flex-wrap justify-center gap-2"
          >
            {plans.map((plan) => (
              <li
                key={plan}
                className="rounded-full border border-border bg-muted/40 px-3 py-1 font-medium text-foreground text-xs"
              >
                {plan}
              </li>
            ))}
          </ul>
        ) : null}

        {billedTo ? (
          <p className="text-center text-muted-foreground text-xs">
            {t('billed_to', { name: billedTo })}
          </p>
        ) : null}

        <DialogFooter className="sm:justify-center">
          {action ? (
            <>
              <DialogClose asChild>
                <Button variant="ghost">{t('not_now')}</Button>
              </DialogClose>
              <Button asChild>
                <a href={getPayBillingUrl(billingWsId)}>{t(action)}</a>
              </Button>
            </>
          ) : (
            <DialogClose asChild>
              <Button>{t('ok')}</Button>
            </DialogClose>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
