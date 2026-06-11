'use client';

import type { WalletCheckpoint } from '@tuturuuu/internal-api/finance';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import { Label } from '@tuturuuu/ui/label';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';

function toLocalInputValue(value?: string) {
  const date = value ? new Date(value) : new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function toIsoTimestamp(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function WalletCheckpointDialog({
  checkpoint,
  currency,
  isPending,
  mode,
  onOpenChange,
  onSubmit,
  open,
}: {
  checkpoint?: WalletCheckpoint | null;
  currency: string;
  isPending: boolean;
  mode: 'create' | 'edit';
  onOpenChange: (open: boolean) => void;
  onSubmit: (payload: {
    actual_balance: number;
    checked_at: string;
    note: string | null;
  }) => void;
  open: boolean;
}) {
  const t = useTranslations('wallet-checkpoints');
  const [amount, setAmount] = useState('');
  const [checkedAt, setCheckedAt] = useState(toLocalInputValue());
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open) return;
    setAmount(checkpoint ? String(checkpoint.actual_balance) : '');
    setCheckedAt(toLocalInputValue(checkpoint?.checked_at));
    setNote(checkpoint?.note ?? '');
  }, [checkpoint, open]);

  const parsedAmount = useMemo(() => Number(amount), [amount]);
  const isoTimestamp = useMemo(() => toIsoTimestamp(checkedAt), [checkedAt]);
  const canSubmit = Number.isFinite(parsedAmount) && !!isoTimestamp;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === 'edit' ? t('edit_checkpoint') : t('record_checkpoint')}
          </DialogTitle>
          <DialogDescription>
            {mode === 'edit'
              ? t('edit_checkpoint_description')
              : t('record_checkpoint_description')}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="checkpoint-amount">
              {t('actual_balance_with_currency', { currency })}
            </Label>
            <Input
              id="checkpoint-amount"
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="checkpoint-checked-at">{t('checked_at')}</Label>
            <Input
              id="checkpoint-checked-at"
              type="datetime-local"
              value={checkedAt}
              onChange={(event) => setCheckedAt(event.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="checkpoint-note">{t('note')}</Label>
            <Textarea
              id="checkpoint-note"
              value={note}
              maxLength={500}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            {t('cancel')}
          </Button>
          <Button
            type="button"
            disabled={!canSubmit || isPending}
            onClick={() => {
              if (!isoTimestamp) return;
              onSubmit({
                actual_balance: parsedAmount,
                checked_at: isoTimestamp,
                note: note.trim() || null,
              });
            }}
          >
            {isPending ? t('saving') : t('save_checkpoint')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
