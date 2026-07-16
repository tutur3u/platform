'use client';

import { CheckCircle2, ShieldCheck, SquareTerminal } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';

export function SquareFirstPaymentDialog({
  disabled = false,
  fullWidth = false,
}: {
  disabled?: boolean;
  fullWidth?: boolean;
}) {
  const t = useTranslations('inventory.operator.square.guide.safety');

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          className={fullWidth ? 'w-full' : undefined}
          disabled={disabled}
          size="sm"
          variant="outline"
        >
          <SquareTerminal className="size-4" />
          {t('review')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('dialogTitle')}</DialogTitle>
          <DialogDescription>{t('dialogDescription')}</DialogDescription>
        </DialogHeader>
        <ol className="grid gap-3">
          {(['approval', 'item', 'terminal', 'receipt'] as const).map(
            (item, index) => (
              <li className="flex gap-3 text-sm leading-6" key={item}>
                <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40 font-mono text-xs">
                  {index + 1}
                </span>
                <span>{t(`checks.${item}`)}</span>
              </li>
            )
          )}
        </ol>
        <div className="flex gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm leading-6">
          <CheckCircle2 className="mt-1 size-4 shrink-0 text-primary" />
          <span>{t('verifyBothSides')}</span>
        </div>
        <div className="flex gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-3 text-sm leading-6">
          <ShieldCheck className="mt-1 size-4 shrink-0 text-destructive" />
          <span>{t('realMoneyWarning')}</span>
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button">{t('understood')}</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
