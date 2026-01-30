'use client';

import { Sparkles, X } from '@tuturuuu/icons';
import type { ProviderDetectionResult, Wallet } from '@tuturuuu/types';
import { detectProviderFromImage } from '@tuturuuu/types';
import { Button } from '@tuturuuu/ui/button';
import { Card } from '@tuturuuu/ui/card';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useState } from 'react';

interface WalletInterestDetectionBannerProps {
  wallet: Wallet;
  hasInterestConfig: boolean;
  onEnableClick: (detection: ProviderDetectionResult) => void;
}

/**
 * Non-intrusive banner suggesting interest tracking for eligible wallets.
 * Only shown for Momo/ZaloPay wallets that don't have interest tracking enabled.
 */
export function WalletInterestDetectionBanner({
  wallet,
  hasInterestConfig,
  onEnableClick,
}: WalletInterestDetectionBannerProps) {
  const t = useTranslations('wallet-interest');
  const [isDismissed, setIsDismissed] = useState(false);

  const detection = useMemo(
    () => detectProviderFromImage(wallet.image_src),
    [wallet.image_src]
  );

  const handleEnableClick = useCallback(() => {
    onEnableClick(detection);
  }, [detection, onEnableClick]);

  // Don't show if:
  // - Not eligible (not Momo/ZaloPay)
  // - Already has interest config
  // - User dismissed the banner
  if (!detection.isEligible || hasInterestConfig || isDismissed) {
    return null;
  }

  const providerName = detection.provider === 'momo' ? 'Momo' : 'ZaloPay';

  return (
    <Card className="relative overflow-hidden border-dynamic-yellow/30 bg-dynamic-yellow/5">
      <div className="flex items-start gap-4 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-dynamic-yellow/20">
          <Sparkles className="h-5 w-5 text-dynamic-yellow" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold">
            {t('detection_banner_title', { provider: providerName })}
          </h3>
          <p className="mt-1 text-foreground/70 text-sm">
            {t('detection_banner_description', { provider: providerName })}
          </p>
          <Button size="sm" className="mt-3" onClick={handleEnableClick}>
            {t('enable_tracking')}
          </Button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={() => setIsDismissed(true)}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">{t('dismiss')}</span>
        </Button>
      </div>
    </Card>
  );
}
