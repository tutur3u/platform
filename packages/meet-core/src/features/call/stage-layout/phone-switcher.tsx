'use client';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@tuturuuu/ui/sheet';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
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
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: readonly ActivityMeta[];
  currentId: string | null;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations('meet.call.stage_layout');
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="gap-2 rounded-t-3xl px-4 pb-8"
        aria-describedby={undefined}
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
                    className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground"
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
      </SheetContent>
    </Sheet>
  );
}
