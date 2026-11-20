'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type BillSplitDetail,
  listBillSplitStatusLinks,
  writeBillSplitStatusLink,
} from '@tuturuuu/internal-api/finance-bill-splits';
import { useFormatter, useTranslations } from 'next-intl';
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
import { Input } from '../../input';
import { Label } from '../../label';

export function BillSplitStatusLinks({
  wsId,
  split,
  bankEnabled,
}: {
  wsId: string;
  split: BillSplitDetail;
  bankEnabled: boolean;
}) {
  const t = useTranslations('bill-splits');
  const format = useFormatter();
  const [open, setOpen] = useState(false);
  const [participantId, setParticipantId] = useState('');
  const [name, setName] = useState('');
  const [receiver, setReceiver] = useState('');
  const ownReceivingContacts = split.participants.filter(
    (person) => person.canConfirm && person.contactId
  );
  const [url, setUrl] = useState('');
  const [linkId, setLinkId] = useState('');
  const [copied, setCopied] = useState(false);
  const queryClient = useQueryClient();
  const key = ['bill-splits', wsId, split.id, 'status-links'];

  const links = useQuery({
    queryKey: key,
    queryFn: () => listBillSplitStatusLinks(wsId, split.id),
    enabled: open,
  });
  const change = useMutation({
    mutationFn: (input: Parameters<typeof writeBillSplitStatusLink>[2]) =>
      writeBillSplitStatusLink(wsId, split.id, input),
    onSuccess: (result) => {
      if (result.url) {
        setUrl(result.url);
        setLinkId(result.id);
        setCopied(false);
      } else if (result.id === linkId) {
        setUrl('');
        setLinkId('');
      }
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (change.isPending) return;
        if (!next) {
          setUrl('');
          setLinkId('');
          setCopied(false);
          change.reset();
        }
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          {t('share-status')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('share-status')}</DialogTitle>
          <DialogDescription>{t('share-description')}</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!change.isPending)
              change.mutate({
                kind: 'issue',
                hours: 24,
                ...(participantId
                  ? { participantId, publicName: name.trim() || undefined }
                  : {}),
                ...(receiver && bankEnabled
                  ? { receivingParticipantId: receiver }
                  : {}),
              });
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="bill-split-link-scope">{t('link-scope')}</Label>
            <select
              value={participantId}
              disabled={change.isPending}
              id="bill-split-link-scope"
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              onChange={(event) => setParticipantId(event.target.value)}
            >
              <option value="">{t('whole-split')}</option>
              {split.participants.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.displayName}
                </option>
              ))}
            </select>
          </div>
          {participantId && (
            <div className="grid gap-1.5">
              <Label htmlFor="bill-split-public-name">
                {t('optional-public-name')}
              </Label>
              <Input
                id="bill-split-public-name"
                value={name}
                maxLength={80}
                disabled={change.isPending}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
          )}
          {bankEnabled && ownReceivingContacts.length > 0 && (
            <div className="grid gap-1.5">
              <Label htmlFor="bill-split-share-qr">{t('share-own-qr')}</Label>
              <select
                id="bill-split-share-qr"
                value={receiver}
                disabled={change.isPending}
                onChange={(event) => setReceiver(event.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">{t('no-qr')}</option>
                {ownReceivingContacts.map((person) => (
                  <option value={person.id} key={person.id}>
                    {person.displayName}
                  </option>
                ))}
              </select>
              {receiver && (
                <p className="text-muted-foreground text-sm">
                  {t('qr-disclosure')}
                </p>
              )}
            </div>
          )}
          <Button type="submit" disabled={change.isPending}>
            {t('create-link')}
          </Button>
        </form>
        {url && (
          <div className="grid gap-2">
            <Label htmlFor="bill-split-status-url">{t('status-link')}</Label>
            <div className="flex items-center gap-2">
              <Input id="bill-split-status-url" readOnly value={url} />
              <Button
                variant="outline"
                onClick={() => {
                  void navigator.clipboard
                    .writeText(url)
                    .then(() => setCopied(true))
                    .catch(() => {});
                }}
              >
                {t(copied ? 'copied' : 'copy')}
              </Button>
            </div>
          </div>
        )}
        {links.data && links.data.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {links.data.map((link) => (
              <li
                key={link.id}
                className="flex flex-wrap items-center justify-between gap-3 px-3 py-2"
              >
                <span className="text-sm">
                  {t('link-expiry', {
                    expiry: format.dateTime(new Date(link.expiresAt), {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }),
                  })}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={change.isPending}
                  onClick={() =>
                    change.mutate({ kind: 'revoke', linkId: link.id })
                  }
                >
                  {t('revoke-link')}
                </Button>
              </li>
            ))}
          </ul>
        )}
        {(change.isError || links.isError) && (
          <p role="alert" className="text-destructive text-sm">
            {t('link-error')}
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
