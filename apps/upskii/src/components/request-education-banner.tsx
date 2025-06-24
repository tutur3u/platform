'use client';

import { RequestFeatureAccessDialog } from './request-feature-access-dialog';
import { Button } from '@tuturuuu/ui/button';
import { BookOpenText, Plus } from '@tuturuuu/ui/icons';
import { FeatureFlag } from '@tuturuuu/utils/feature-flags/types';
import clsx from 'clsx';
import { useTranslations } from 'next-intl';

interface EducationBannerProps {
  workspaceName: string | null;
  wsId: string;
  className?: string;
  enabledFeatures: Record<FeatureFlag, boolean>;
}

export function EducationBanner({
  workspaceName,
  wsId,
  className,
  enabledFeatures,
}: EducationBannerProps) {
  const t = useTranslations();
  return (
    <div
      className={clsx(
        'relative overflow-hidden rounded-xl border border-dynamic-blue/30 bg-gradient-to-br from-dynamic-blue/10 via-dynamic-blue/5 to-dynamic-blue/10 p-6 shadow-sm backdrop-blur-sm transition-all duration-300 hover:shadow-md dark:border-dynamic-blue/40 dark:from-dynamic-blue/15 dark:via-dynamic-blue/10 dark:to-dynamic-blue/15',
        className
      )}
    >
      {/* Decorative elements */}
      <div className="bg-grid-pattern absolute inset-0 opacity-[0.02] dark:opacity-[0.04]"></div>
      <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-dynamic-blue/20 blur-3xl"></div>
      <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-dynamic-blue/15 blur-3xl"></div>

      <div className="relative z-10 flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-dynamic-blue to-dynamic-blue/80 shadow-lg ring-4 ring-dynamic-blue/20 transition-transform duration-200 hover:scale-105">
            <BookOpenText className="h-7 w-7 text-white" />
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-foreground">
                {t('unlock-education-features')}
              </h3>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t('transform-your-workspace')}
            </p>
          </div>
        </div>
        <RequestFeatureAccessDialog
          workspaceName={workspaceName}
          wsId={wsId}
          enabledFeatures={enabledFeatures}
        >
          <Button variant="default" size="default">
            <Plus className="mr-2 h-4 w-4" />
            {t('request-feature')}
          </Button>
        </RequestFeatureAccessDialog>
      </div>
    </div>
  );
}
