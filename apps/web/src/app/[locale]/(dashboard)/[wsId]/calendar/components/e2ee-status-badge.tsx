'use client';

import { Loader2, ShieldCheck, ShieldPlus } from '@tuturuuu/icons';
import { Badge } from '@tuturuuu/ui/badge';
import { Button } from '@tuturuuu/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import type { E2EEStatus, FixProgress } from '../hooks/use-e2ee';
import { isE2EEEnabled, isE2EENoKey } from '../hooks/use-e2ee';

interface E2EEStatusBadgeProps {
  status: E2EEStatus | undefined;
  isLoading: boolean;
  isVerifying: boolean;
  isFixing: boolean;
  isMigrating: boolean;
  isEnabling: boolean;
  fixProgress: FixProgress | null;
  hasUnencryptedEvents: boolean;
  onVerify: () => void;
  onMigrate: () => void;
  onEnable: () => void;
}

export function E2EEStatusBadge({
  status,
  isLoading,
  isVerifying,
  isFixing,
  isMigrating,
  isEnabling,
  fixProgress,
  hasUnencryptedEvents,
  onVerify,
  onMigrate,
  onEnable,
}: E2EEStatusBadgeProps) {
  const t = useTranslations('calendar');

  // Loading state
  if (isLoading) {
    return (
      <Badge
        variant="outline"
        className="flex items-center gap-1.5 border-muted-foreground/30 bg-muted/50 text-muted-foreground"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        <span className="hidden sm:inline">{t('e2ee.checking')}</span>
      </Badge>
    );
  }

  // E2EE Active - All Encrypted (Click to verify)
  if (isE2EEEnabled(status) && !hasUnencryptedEvents) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={isVerifying || isFixing}
              onClick={onVerify}
              className={`flex h-auto items-center gap-1.5 px-2 py-1 transition-all ${
                isVerifying
                  ? 'border-blue-500/50 bg-blue-500/10 text-blue-600 dark:text-blue-400'
                  : isFixing
                    ? 'border-amber-500/50 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'border-green-500/50 bg-green-500/10 text-green-600 hover:bg-green-500/20 dark:text-green-400'
              }`}
            >
              {isVerifying ? (
                <VerifyingContent t={t} />
              ) : isFixing ? (
                <FixingContent t={t} fixProgress={fixProgress} />
              ) : (
                <EnabledContent t={t} />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              {isVerifying
                ? t('e2ee.verifying_tooltip')
                : isFixing
                  ? t('e2ee.fixing_tooltip')
                  : t('e2ee.verify_tooltip')}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Has Unencrypted Events - Show migration button
  if (hasUnencryptedEvents && isE2EEEnabled(status)) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={onMigrate}
              disabled={isMigrating}
              className="flex items-center gap-1.5 border-amber-500/50 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400"
            >
              {isMigrating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">
                {t('e2ee.encrypt_events', {
                  count: status.unencryptedCount,
                })}
              </span>
              <span className="sm:hidden">{status.unencryptedCount}</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>
              {t('e2ee.unencrypted_warning', {
                count: status.unencryptedCount,
              })}
            </p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Enable E2EE Button - E2EE is available but workspace has no key
  if (isE2EENoKey(status)) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={onEnable}
              disabled={isEnabling}
              className="flex items-center gap-1.5 border-amber-500/50 bg-amber-500/10 text-amber-600 hover:bg-amber-500/20 dark:text-amber-400"
            >
              {isEnabling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldPlus className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">{t('e2ee.enable')}</span>
              <span className="sm:hidden">E2EE</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('e2ee.enable_tooltip')}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Disabled or unknown state - don't show anything
  return null;
}

// Sub-components for cleaner JSX
function VerifyingContent({
  t,
}: {
  t: ReturnType<typeof useTranslations<'calendar'>>;
}) {
  return (
    <>
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span className="hidden text-xs sm:inline">{t('e2ee.verifying')}</span>
    </>
  );
}

function FixingContent({
  t,
  fixProgress,
}: {
  t: ReturnType<typeof useTranslations<'calendar'>>;
  fixProgress: FixProgress | null;
}) {
  return (
    <>
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span className="hidden text-xs sm:inline">
        {fixProgress ? `${fixProgress.progress}%` : t('e2ee.fixing')}
      </span>
      <span className="text-xs sm:hidden">
        {fixProgress ? `${fixProgress.progress}%` : '...'}
      </span>
    </>
  );
}

function EnabledContent({
  t,
}: {
  t: ReturnType<typeof useTranslations<'calendar'>>;
}) {
  return (
    <>
      <ShieldCheck className="h-3.5 w-3.5" />
      <span className="hidden text-xs sm:inline">{t('e2ee.enabled')}</span>
      <span className="text-xs sm:hidden">E2EE</span>
    </>
  );
}
