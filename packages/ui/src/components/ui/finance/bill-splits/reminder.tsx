'use client';

import { useMutation } from '@tanstack/react-query';
import {
  type BillSplitDetail,
  scheduleBillSplitReminder,
} from '@tuturuuu/internal-api/finance-bill-splits';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '../../button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../dialog';
import { Label } from '../../label';

export function BillSplitReminder({
  wsId,
  split,
}: {
  wsId: string;
  split: BillSplitDetail;
}) {
  const t = useTranslations('bill-splits');
  const [participant, setParticipant] = useState('');
  const sent = useMutation({
    mutationFn: (participantId: string) =>
      scheduleBillSplitReminder(wsId, split.id, participantId),
  });
  const debtors = new Set(
    split.ledger.settlement.transfers.map(({ from }) => from)
  );
  const recipients = split.participants.filter(
    (person) => !person.canConfirm && debtors.has(person.id)
  );
  if (!recipients.length) return null;

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open && !sent.isPending) {
          setParticipant('');
          sent.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {t('reminder')}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('reminder')}</DialogTitle>
          <DialogDescription>{t('reminder-description')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (participant && !sent.isPending) sent.mutate(participant);
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="bill-split-reminder-recipient">
              {t('recipient')}
            </Label>
            <select
              id="bill-split-reminder-recipient"
              value={participant}
              disabled={sent.isPending}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              onChange={(event) => {
                setParticipant(event.target.value);
                sent.reset();
              }}
            >
              <option value="">{t('choose-person')}</option>
              {recipients.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.displayName}
                </option>
              ))}
            </select>
          </div>
          {sent.isSuccess && (
            <p role="status" className="text-sm">
              {t('reminder-scheduled')}
            </p>
          )}
          {sent.isError && (
            <p role="alert" className="text-sm text-destructive">
              {t('reminder-error')}
            </p>
          )}
          <Button
            type="submit"
            disabled={!participant || sent.isPending || sent.isSuccess}
          >
            {t('schedule-reminder')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
