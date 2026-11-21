'use client';

import { Monitor, Moon, Sun } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  FloatingBarGroup,
  FloatingBarSeparator,
} from '@tuturuuu/ui/floating-bar';
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
    <>
      {standalone ? null : <FloatingBarSeparator />}
      <FloatingBarGroup aria-label={t('message_appearance')}>
        {(['auto', 'dark', 'original'] as const).map((value) => {
          const Icon =
            value === 'auto' ? Monitor : value === 'dark' ? Moon : Sun;
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
      </FloatingBarGroup>
    </>
  );
}
