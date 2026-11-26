'use client';

import { ArrowBigUpDash, ExternalLink, Lock, X } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { getPayBillingUrl } from '@/lib/pay-app-url';
import {
  MIRA_PERMISSIONS_LEARN_MORE_URL,
  MIRA_PRICING_LEARN_MORE_URL,
  type MiraChatDenial,
} from './mira-chat-denial';

interface MiraChatDenialBannerProps {
  billingWsId: string;
  denial: MiraChatDenial;
  onDismiss: () => void;
}

export function MiraChatDenialBanner({
  billingWsId,
  denial,
  onDismiss,
}: MiraChatDenialBannerProps) {
  const t = useTranslations('dashboard.mira_chat.request_denied');
  const showUpgrade =
    denial.kind === 'plan' ||
    denial.kind === 'credits' ||
    denial.kind === 'daily_limit';
  const learnMoreHref =
    denial.kind === 'permission'
      ? MIRA_PERMISSIONS_LEARN_MORE_URL
      : MIRA_PRICING_LEARN_MORE_URL;

  return (
    <div
      role="alert"
      data-testid="mira-chat-denial-banner"
      data-denial-kind={denial.kind}
      className="flex flex-col gap-3 rounded-2xl border border-dynamic-amber/30 bg-dynamic-amber/10 p-3 text-sm sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex min-w-0 items-start gap-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-dynamic-amber/25 bg-background/80 text-dynamic-amber">
          <Lock aria-hidden className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium text-foreground leading-snug">
            {t(`${denial.kind}.title`)}
          </p>
          <p className="text-muted-foreground text-xs leading-relaxed">
            {t(`${denial.kind}.description`)}
          </p>
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-center">
        {showUpgrade ? (
          <Button asChild size="sm" className="h-8 gap-1.5 px-3 text-xs">
            <a href={getPayBillingUrl(billingWsId)}>
              <ArrowBigUpDash aria-hidden className="h-3.5 w-3.5" />
              {t('upgrade')}
            </a>
          </Button>
        ) : null}
        <Button
          asChild
          variant={showUpgrade ? 'outline' : 'secondary'}
          size="sm"
          className="h-8 gap-1.5 px-3 text-xs"
        >
          <a href={learnMoreHref} target="_blank" rel="noreferrer">
            {t('learn_more')}
            <ExternalLink aria-hidden className="h-3 w-3" />
          </a>
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onDismiss}
          className="h-8 w-8 shrink-0"
          aria-label={t('dismiss')}
        >
          <X aria-hidden className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
