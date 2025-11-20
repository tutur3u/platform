'use client';

import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useCalendarSettings } from './settings-context';

interface CalendarSettingsLayoutProps {
  children: ReactNode;
  title: string;
  description: string;
  hideActions?: boolean;
}

export function CalendarSettingsLayout({
  children,
  title,
  description,
  hideActions = false,
}: CalendarSettingsLayoutProps) {
  const { hasChanges, saveSettings, resetSettings } = useCalendarSettings();
  const t = useTranslations('common');

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <h3 className="font-semibold text-lg">{title}</h3>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
      <div className="space-y-8">{children}</div>
      {!hideActions && (
        <div className="flex justify-end gap-2 border-t pt-4">
          <Button
            variant="outline"
            onClick={resetSettings}
            disabled={!hasChanges}
          >
            {t('cancel')}
          </Button>
          <Button
            onClick={saveSettings}
            disabled={!hasChanges}
            className={cn(
              hasChanges && 'animate-pulse bg-primary/90 hover:bg-primary'
            )}
          >
            {t('save')}
          </Button>
        </div>
      )}
    </div>
  );
}
