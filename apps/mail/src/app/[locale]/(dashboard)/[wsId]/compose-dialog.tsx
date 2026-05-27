'use client';

import { Send } from '@tuturuuu/icons';
import type {
  MailMailbox,
  SendMailMessagePayload,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@tuturuuu/ui/dialog';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface ComposeDialogProps {
  mailboxes: MailMailbox[];
  onOpenChange: (open: boolean) => void;
  onSend: (mailboxId: string, payload: SendMailMessagePayload) => Promise<void>;
  open: boolean;
  selectedMailboxId: string | null;
  sending: boolean;
}

function parseRecipients(value: string) {
  return value
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function ComposeDialog({
  mailboxes,
  onOpenChange,
  onSend,
  open,
  selectedMailboxId,
  sending,
}: ComposeDialogProps) {
  const t = useTranslations('mail');
  const sendableMailboxes = mailboxes.filter((mailbox) =>
    ['admin', 'owner', 'sender'].includes(mailbox.role)
  );
  const [mailboxId, setMailboxId] = useState(
    selectedMailboxId ?? sendableMailboxes[0]?.id ?? ''
  );
  const [to, setTo] = useState('');
  const [cc, setCc] = useState('');
  const [bcc, setBcc] = useState('');
  const [subject, setSubject] = useState('');
  const [bodyText, setBodyText] = useState('');

  const activeMailboxId =
    mailboxId || selectedMailboxId || sendableMailboxes[0]?.id;
  const canSend =
    Boolean(activeMailboxId) &&
    parseRecipients(to).length > 0 &&
    bodyText.trim();

  const reset = () => {
    setTo('');
    setCc('');
    setBcc('');
    setSubject('');
    setBodyText('');
  };

  const submit = async () => {
    if (!activeMailboxId || !canSend) return;

    await onSend(activeMailboxId, {
      bcc: parseRecipients(bcc),
      bodyText,
      cc: parseRecipients(cc),
      subject,
      to: parseRecipients(to),
    });
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-hidden p-0">
        <DialogHeader className="border-dynamic border-b px-5 py-4">
          <DialogTitle>{t('compose')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 overflow-y-auto px-5 py-4">
          <div className="grid gap-2 sm:grid-cols-[96px_1fr] sm:items-center">
            <label className="font-medium text-muted-foreground text-sm">
              {t('from')}
            </label>
            <Select value={activeMailboxId} onValueChange={setMailboxId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sendableMailboxes.map((mailbox) => (
                  <SelectItem key={mailbox.id} value={mailbox.id}>
                    {mailbox.displayName} ({mailbox.address})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Field label={t('to')} value={to} onChange={setTo} />
          <Field label={t('cc')} value={cc} onChange={setCc} />
          <Field label={t('bcc')} value={bcc} onChange={setBcc} />
          <Field label={t('subject')} value={subject} onChange={setSubject} />
          <div className="space-y-2">
            <label className="font-medium text-muted-foreground text-sm">
              {t('message')}
            </label>
            <Textarea
              value={bodyText}
              onChange={(event) => setBodyText(event.target.value)}
              className="min-h-64 resize-none"
            />
          </div>
        </div>
        <DialogFooter className="border-dynamic border-t px-5 py-4">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button onClick={submit} disabled={!canSend || sending}>
            <Send className="h-4 w-4" />
            {sending ? t('sending') : t('send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-[96px_1fr] sm:items-center">
      <label className="font-medium text-muted-foreground text-sm">
        {label}
      </label>
      <Input value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}
