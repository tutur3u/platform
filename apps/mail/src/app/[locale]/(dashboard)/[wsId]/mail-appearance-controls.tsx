'use client';

import { Monitor, Moon, Sun } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { useMailPreviewAppearance } from './mail-preview-appearance';

export function MailAppearanceControls({
  standalone = false,
}: {
  standalone?: boolean;
}) {
  const t = useTranslations('mail');
  const [mode, setMode] = useMailPreviewAppearance();
  return (
    <fieldset
      className={
        standalone
          ? 'flex shrink-0 items-center gap-0.5'
          : 'ml-1 flex shrink-0 items-center gap-0.5 border-border border-l pl-1'
      }
      aria-label={t('message_appearance')}
    >
      {(['auto', 'dark', 'original'] as const).map((value) => {
        const Icon = value === 'auto' ? Monitor : value === 'dark' ? Moon : Sun;
        const label = t(
          value === 'auto'
            ? 'app_theme_view'
            : value === 'dark'
              ? 'dark_view'
              : 'original_view'
        );
        return (
          <Tooltip key={value}>
            <TooltipTrigger asChild>
              <Button
                type="button"
                size="icon"
                className="size-8!"
                variant={mode === value ? 'secondary' : 'ghost'}
                aria-label={label}
                aria-pressed={mode === value}
                onClick={() => setMode(value)}
              >
                <Icon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{label}</TooltipContent>
          </Tooltip>
        );
      })}
    </fieldset>
  );
}
