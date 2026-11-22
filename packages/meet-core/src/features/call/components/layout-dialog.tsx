'use client';
import {
  Focus,
  LayoutDashboard,
  LayoutGrid,
  PanelRight,
} from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import type { CallLayout } from './call-stage';

export const CALL_LAYOUTS = ['auto', 'grid', 'spotlight', 'sidebar'] as const;
const LAYOUT_ICONS = {
  auto: LayoutDashboard,
  grid: LayoutGrid,
  spotlight: Focus,
  sidebar: PanelRight,
} as const;

/** Stage layout as its own dialog; a choice applies at once and closes it. */
export function LayoutDialog({
  open,
  onOpenChange,
  layout,
  setLayout,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  layout: CallLayout;
  setLayout: (layout: CallLayout) => void;
}) {
  const t = useTranslations('meet.call');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('layout')}</DialogTitle>
          <DialogDescription>{t('layout_dialog_hint')}</DialogDescription>
        </DialogHeader>
        <div
          role="radiogroup"
          aria-label={t('layout')}
          className="grid grid-cols-2 gap-2"
        >
          {CALL_LAYOUTS.map((value) => {
            const Icon = LAYOUT_ICONS[value];
            const selected = layout === value;
            return (
              <Button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                variant={selected ? 'secondary' : 'outline'}
                className="h-11 justify-start gap-2 rounded-full px-4 aria-checked:border-foreground"
                onClick={() => {
                  setLayout(value);
                  onOpenChange(false);
                }}
              >
                <Icon className="size-4" />
                {t(`layout_${value}`)}
              </Button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
