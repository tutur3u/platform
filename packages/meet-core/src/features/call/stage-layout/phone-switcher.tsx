'use client';

import { Plus } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@tuturuuu/ui/sheet';
import { cn } from '@tuturuuu/utils/format';
import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { activityTone } from './activity-tones';
import type { ActivityMeta } from './pane-chrome';

/**
 * Phones show one activity at a time. This sheet lists every open activity
 * and brings the chosen one forward.
 */
export function PhoneSwitcher({
  open,
  onOpenChange,
  items,
  currentId,
  onSelect,
  onBrowse,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: readonly ActivityMeta[];
  currentId: string | null;
  onSelect: (id: string) => void;
  /** Opens the Activities dialog to add another activity. */
  onBrowse?: () => void;
}) {
  const t = useTranslations('meet.call.stage_layout');
  const handoff = useRef(false);
  // A handoff that never completed must not open the dialog on a later close.
  useEffect(() => {
    if (open) handoff.current = false;
  }, [open]);
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="gap-2 rounded-t-3xl px-4 pb-8"
        aria-describedby={undefined}
        onCloseAutoFocus={(event) => {
          // Open the next dialog only once this sheet is gone, so two modals
          // never overlap and the page can be pressed again afterwards.
          if (!handoff.current) return;
          handoff.current = false;
          event.preventDefault();
          if (document.body.style.pointerEvents === 'none')
            document.body.style.pointerEvents = '';
          requestAnimationFrame(() => onBrowse?.());
        }}
      >
        <SheetHeader className="p-0 pt-2">
          <SheetTitle>{t('switcher_title')}</SheetTitle>
          <SheetDescription className="sr-only">
            {t('switcher_title')}
          </SheetDescription>
        </SheetHeader>
        <ul className="flex flex-col gap-2">
          {items.map((item) => {
            const current = item.id === currentId;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  aria-current={current || undefined}
                  className={cn(
                    'flex min-h-14 w-full items-center gap-3 rounded-2xl border px-3.5 py-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    current ? 'border-foreground' : 'border-border'
                  )}
                  onClick={() => {
                    onSelect(item.id);
                    onOpenChange(false);
                  }}
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      'grid size-9 shrink-0 place-items-center rounded-xl',
                      activityTone(item.id)
                    )}
                  >
                    <item.icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {item.title}
                  </span>
                  {current && (
                    <span className="text-muted-foreground text-xs">
                      {t('showing')}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        {onBrowse && (
          <Button
            type="button"
            variant="outline"
            className="mt-2 h-11 gap-2 rounded-full"
            onClick={() => {
              handoff.current = true;
              onOpenChange(false);
            }}
          >
            <Plus aria-hidden="true" className="size-4" />
            {t('open_another')}
          </Button>
        )}
      </SheetContent>
    </Sheet>
  );
}
