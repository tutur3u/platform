'use client';

import { Crown } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';

export default function CurrentPlanCard() {
  const t = useTranslations('settings-account');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="rounded-full bg-amber-100 p-2.5 dark:bg-amber-900/30">
          <Crown className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        </div>
        <div className="space-y-1">
          <h3 className="font-semibold text-lg">{t('current-plan')}</h3>
          <p className="text-muted-foreground text-sm">
            {t('current-plan-description')}
          </p>
        </div>
      </div>

      <div className="grid gap-6">
        {/* Current Plan Details */}
        <div className="rounded-lg border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <Badge
              variant="default"
              className="bg-linear-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700"
            >
              {t('free-plan')}
            </Badge>
            <span className="font-bold text-2xl">
              $0
              <span className="font-normal text-base text-muted-foreground">
                /{t('per-month')}
              </span>
            </span>
          </div>

          <div className="mt-6 space-y-3">
            <Button className="w-full" variant="default" disabled>
              {t('upgrade-plan')}
            </Button>
            <Button className="w-full" variant="outline" disabled>
              {t('view-all-plans')}
            </Button>
          </div>
        </div>

        {/* Upgrade Preview */}
        <div className="flex flex-col justify-between rounded-lg border bg-linear-to-br from-purple-50 to-blue-50 p-6 dark:from-purple-950/20 dark:to-blue-950/20">
          <div>
            <p className="font-medium text-muted-foreground text-sm uppercase tracking-wider">
              Next tier: {t('pro-plan')}
            </p>
            <div className="mt-2">
              <span className="font-bold text-2xl">
                $6
                <span className="font-normal text-base text-muted-foreground">
                  /{t('per-month')}
                </span>
              </span>
            </div>
            <p className="mt-2 text-muted-foreground text-sm">
              Unlimited meetings, advanced AI features, and priority support.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
