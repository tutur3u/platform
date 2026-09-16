'use client';

import { AudioLines, Sparkles, Zap } from '@tuturuuu/icons';
import type { LiveMode } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';

export function MiraLiveModeControl({
  mode,
  disabled,
  onChange,
}: {
  mode: LiveMode;
  disabled?: boolean;
  onChange: (mode: LiveMode) => void;
}) {
  const t = useTranslations('dashboard.voice_assistant');
  return (
    <div className="flex shrink-0 items-center gap-3 px-1">
      <span className="inline-flex items-center gap-1.5 font-medium text-sm">
        <AudioLines aria-hidden className="size-4 text-primary" />
        {t('live_mode')}
      </span>
      <fieldset
        aria-label={t('response_mode')}
        className="flex rounded-full border bg-muted/40 p-0.5"
      >
        {(['flash', 'pro'] as const).map((value) => {
          const Icon = value === 'flash' ? Zap : Sparkles;
          return (
            <Tooltip key={value}>
              <TooltipTrigger asChild>
                <Button
                  disabled={disabled}
                  size="sm"
                  variant={mode === value ? 'secondary' : 'ghost'}
                  aria-pressed={mode === value}
                  onClick={() => onChange(value)}
                  className="h-8 gap-1.5 rounded-full px-2.5 text-xs"
                >
                  <Icon aria-hidden className="size-3.5" />
                  {t(value === 'flash' ? 'flash_mode' : 'pro_mode')}
                </Button>
              </TooltipTrigger>
              <TooltipContent className="max-w-64 text-balance">
                <p>
                  {t(
                    value === 'flash' ? 'flash_description' : 'pro_description'
                  )}
                </p>
                <p className="mt-1 opacity-80">{t('mode_switch_hint')}</p>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </fieldset>
    </div>
  );
}
