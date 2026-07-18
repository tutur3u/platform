'use client';

import { CheckCircle2, ShieldCheck, SquareTerminal } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { Dialog, DialogClose, DialogTrigger } from '@tuturuuu/ui/dialog';
import { useTranslations } from 'next-intl';
import {
  OperatorDialogBody,
  OperatorDialogContent,
  OperatorDialogFooter,
  OperatorDialogHeader,
} from './operator-dialog-shell';

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
      <OperatorDialogContent size="md">
        <OperatorDialogHeader
          description={t('dialogDescription')}
          title={t('dialogTitle')}
        />
        <OperatorDialogBody className="grid gap-4">
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
        </OperatorDialogBody>
        <OperatorDialogFooter>
          <DialogClose asChild>
            <Button type="button">{t('understood')}</Button>
          </DialogClose>
        </OperatorDialogFooter>
      </OperatorDialogContent>
    </Dialog>
  );
}
