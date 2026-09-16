'use client';

import { AudioLines, Sparkles, Zap } from '@tuturuuu/icons';
import type { LiveMode } from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
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
    <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
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
            <Button
              key={value}
              disabled={disabled}
              size="sm"
              variant={mode === value ? 'secondary' : 'ghost'}
              aria-pressed={mode === value}
              title={t(
                value === 'flash' ? 'flash_description' : 'pro_description'
              )}
              onClick={() => onChange(value)}
              className="h-7 gap-1.5 rounded-full px-3 text-xs"
            >
              <Icon aria-hidden className="size-3.5" />
              {t(value === 'flash' ? 'flash_mode' : 'pro_mode')}
            </Button>
          );
        })}
      </fieldset>
      <p className="w-full text-muted-foreground text-xs">
        {t(mode === 'flash' ? 'flash_description' : 'pro_description')}{' '}
        {t('mode_switch_hint')}
      </p>
    </div>
  );
}
