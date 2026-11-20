'use client';

import { useMutation } from '@tanstack/react-query';
import {
  type BillSplitDetail,
  billSplitContactBank,
} from '@tuturuuu/internal-api/finance-bill-splits';
import { useTranslations } from 'next-intl';
import { QRCodeSVG } from 'qrcode.react';
import { useState } from 'react';
import { Button } from '../../button';
import { Checkbox } from '../../checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../dialog';
import { Input } from '../../input';
import { Label } from '../../label';

export function BillSplitContactBank({
  wsId,
  participants,
  canRead,
}: {
  wsId: string;
  participants: BillSplitDetail['participants'];
  canRead: boolean;
}) {
  const t = useTranslations('bill-splits');
  const [open, setOpen] = useState(false);
  const [contact, setContact] = useState('');
  const [consent, setConsent] = useState(false);
  const chosen = participants.find((person) => person.contactId === contact);
  const [details, setDetails] = useState({
    bankName: '',
    bankBin: '',
    holderName: '',
    accountNumber: '',
  });
  const mutation = useMutation({
    mutationFn: (input: Parameters<typeof billSplitContactBank>[2]) =>
      billSplitContactBank(wsId, contact, input),
    onSuccess: (_data, input) => {
      if (input.kind === 'consent' || input.kind === 'revoke') {
        setConsent(false);
        setDetails({
          bankName: '',
          bankBin: '',
          holderName: '',
          accountNumber: '',
        });
      }
    },
  });
  const available = participants.filter(
    (person) => person.contactId && (person.canConfirm || canRead)
  );
  if (!available.length) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!mutation.isPending) {
          if (!next) {
            setDetails({
              bankName: '',
              bankBin: '',
              holderName: '',
              accountNumber: '',
            });
            mutation.reset();
          }
          setConsent(false);
          setOpen(next);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {t('bank-details')}
        </Button>
      </DialogTrigger>
      <DialogContent
        aria-describedby={undefined}
        className="max-h-[90dvh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{t('bank-details')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="bill-split-bank-contact">{t('bank-contact')}</Label>
          <select
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            id="bill-split-bank-contact"
            value={contact}
            disabled={mutation.isPending}
            onChange={(event) => {
              setContact(event.target.value);
              setDetails({
                bankName: '',
                bankBin: '',
                holderName: '',
                accountNumber: '',
              });
              setConsent(false);
              mutation.reset();
            }}
          >
            <option value="">{t('choose-contact')}</option>
            {available.map((person) => (
              <option value={person.contactId ?? ''} key={person.id}>
                {person.displayName}
              </option>
            ))}
          </select>
        </div>
        {chosen && canRead && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ kind: 'masked_read' })}
            >
              {t('masked-account')}
            </Button>
            <Button
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => mutation.mutate({ kind: 'qr' })}
            >
              {t('receiving-qr')}
            </Button>
          </div>
        )}
        {mutation.data?.account && (
          <p className="text-sm">
            {mutation.data.bankName} · {mutation.data.account}
          </p>
        )}
        {mutation.data?.qr && (
          <div className="grid gap-2">
            <p className="text-sm">{mutation.data.holderName}</p>
            <div className="w-fit bg-white">
              <QRCodeSVG
                value={mutation.data.qr}
                title={t('receiving-qr')}
                size={176}
                marginSize={4}
              />
            </div>
          </div>
        )}
        {chosen?.canConfirm && (
          <form
            className="space-y-3 border-t pt-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!consent || mutation.isPending) return;
              mutation.mutate({
                kind: 'consent',
                consent: true,
                bankName: details.bankName,
                bankBin: details.bankBin,
                details: {
                  holderName: details.holderName,
                  accountNumber: details.accountNumber,
                },
              });
            }}
          >
            {(
              [
                ['bankName', 'bank-name', 120],
                ['bankBin', 'bank-bin', 6],
                ['holderName', 'holder-name', 120],
                ['accountNumber', 'account-number', 30],
              ] as const
            ).map(([field, label, maxLength]) => (
              <div className="grid gap-1.5" key={field}>
                <Label htmlFor={`bill-split-${field}`}>{t(label)}</Label>
                <Input
                  id={`bill-split-${field}`}
                  value={details[field]}
                  maxLength={maxLength}
                  required
                  autoComplete="off"
                  disabled={mutation.isPending}
                  onChange={(event) =>
                    setDetails({ ...details, [field]: event.target.value })
                  }
                />
              </div>
            ))}
            <div className="flex items-center gap-2">
              <Checkbox
                disabled={mutation.isPending}
                id="bill-split-bank-consent"
                checked={consent}
                onCheckedChange={(value) => setConsent(value === true)}
              />
              <Label htmlFor="bill-split-bank-consent">
                {t('bank-consent')}
              </Label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!consent || mutation.isPending}>
                {t('save-bank')}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ kind: 'revoke' })}
              >
                {t('withdraw-consent')}
              </Button>
            </div>
          </form>
        )}
        {mutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            {t('bank-error')}
          </p>
        )}
        {mutation.data?.ok && (
          <p role="status" className="text-sm text-muted-foreground">
            {t('bank-updated')}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
