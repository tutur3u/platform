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
        className="flex h-8 w-8 items-center justify-center border-muted-foreground/30 bg-muted/50 p-0 text-muted-foreground"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      </Badge>
    );
  }

  // E2EE Active - All Encrypted (Click to verify)
  if (isE2EEEnabled(status) && !hasUnencryptedEvents) {
    const tooltipText = isVerifying
      ? t('e2ee.verifying_tooltip')
      : isFixing
        ? t('e2ee.fixing_tooltip')
        : t('e2ee.verify_tooltip');

    const colorClass = isVerifying
      ? 'border-dynamic-blue/50 bg-dynamic-blue/10 text-dynamic-blue'
      : isFixing
        ? 'border-dynamic-amber/50 bg-dynamic-amber/10 text-dynamic-amber'
        : 'border-dynamic-green/50 bg-dynamic-green/10 text-dynamic-green hover:bg-dynamic-green/20';

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              disabled={isVerifying || isFixing}
              onClick={onVerify}
              className={`h-8 w-8 ${colorClass}`}
            >
              {isVerifying || isFixing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltipText}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  // Has Unencrypted Events - Show migration button
  if (hasUnencryptedEvents && isE2EEEnabled(status)) {
    const tooltipText = isMigrating
      ? fixProgress
        ? t('e2ee.encrypting_progress', {
            current: fixProgress.current,
            total: fixProgress.total,
          })
        : t('e2ee.encrypting')
      : t('e2ee.unencrypted_warning', {
          count: status.unencryptedCount,
        });

    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={onMigrate}
              disabled={isMigrating}
              className="h-8 w-8 border-dynamic-amber/50 bg-dynamic-amber/10 text-dynamic-amber hover:bg-dynamic-amber/20"
            >
              {isMigrating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldCheck className="h-3.5 w-3.5" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>{tooltipText}</p>
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
              size="icon"
              onClick={onEnable}
              disabled={isEnabling}
              className="h-8 w-8 border-dynamic-amber/50 bg-dynamic-amber/10 text-dynamic-amber hover:bg-dynamic-amber/20"
            >
              {isEnabling ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ShieldPlus className="h-3.5 w-3.5" />
              )}
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
