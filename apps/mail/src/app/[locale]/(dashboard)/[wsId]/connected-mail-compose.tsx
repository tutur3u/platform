'use client';

import { useMutation } from '@tanstack/react-query';
import {
  type ConnectedMailCompose as ConnectedMailComposePayload,
  type ConnectedMailMessage,
  connectedMailRequest,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { Textarea } from '@tuturuuu/ui/textarea';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { connectedReplyDraft } from './connected-mail-reply';

export function ConnectedMailCompose({
  workspaceId,
  accountId,
  address,
  source,
  mode,
  onClose,
  onSent,
}: {
  workspaceId: string;
  accountId: string;
  address: string;
  source?: ConnectedMailMessage;
  mode?: 'reply' | 'reply_all' | 'forward' | 'edit';
  onClose: () => void;
  onSent: () => void;
}) {
  const t = useTranslations('mail');
  const [initial] = useState(() => connectedReplyDraft(source, address, mode));
  const [to, setTo] = useState(initial.to.join(', '));
  const [cc, setCc] = useState(initial.cc.join(', '));
  const [bcc, setBcc] = useState(
    mode === 'edit' ? (source?.bcc?.join(', ') ?? '') : ''
  );
  const [subject, setSubject] = useState(initial.subject);
  const [text, setText] = useState(initial.text);
  const [attachments, setAttachments] = useState<
    NonNullable<ConnectedMailComposePayload['attachments']>
  >([]);
  const [requestId] = useState(() => crypto.randomUUID());
  const [fileError, setFileError] = useState('');
  const [draftSaved, setDraftSaved] = useState(false);
  const split = (value: string) =>
    value
      .split(/[,;]/u)
      .map((entry) => entry.trim())
      .filter(Boolean);
  const mutation = useMutation({
    retry: false,
    mutationFn: (save: boolean) =>
      connectedMailRequest(workspaceId, [accountId, save ? 'drafts' : 'send'], {
        method: 'POST',
        body: {
          requestId,
          ...(mode === 'edit'
            ? {
                draftId: source?.id,
                html: text === initial.text ? source?.html : undefined,
              }
            : {}),
          to: split(to),
          cc: split(cc),
          bcc: split(bcc),
          subject,
          text,
          attachments,
          ...(source
            ? {
                ...(mode === 'edit' ? {} : { sourceId: source.id, mode }),
                attachmentIds:
                  mode === 'forward' || mode === 'edit'
                    ? (source.attachments?.map((file) => file.id) ?? [])
                    : [],
              }
            : {}),
        },
      }),
    onSuccess: (_, save) => {
      if (save) setDraftSaved(true);
      onSent();
    },
  });
  return (
    <div className="space-y-3 rounded-lg border bg-background p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">{t('compose')}</h2>
        <Button variant="ghost" disabled={mutation.isPending} onClick={onClose}>
          {t('connected_close')}
        </Button>
      </div>
      <label className="block text-sm">
        {t('connected_to')}
        <Input value={to} onChange={(event) => setTo(event.target.value)} />
      </label>
      <label className="block text-sm">
        Cc
        <Input value={cc} onChange={(event) => setCc(event.target.value)} />
      </label>
      <label className="block text-sm">
        Bcc
        <Input value={bcc} onChange={(event) => setBcc(event.target.value)} />
      </label>
      <label className="block text-sm">
        {t('connected_subject')}
        <Input
          value={subject}
          onChange={(event) => setSubject(event.target.value)}
        />
      </label>
      <label className="block text-sm">
        {t('connected_body')}
        <Textarea
          className="min-h-48"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      {mode === 'forward' && source?.attachments?.length ? (
        <p className="text-muted-foreground text-sm">
          {t('connected_forward_attachments', {
            count: source.attachments.length,
          })}
        </p>
      ) : null}
      <label className="block text-sm">
        {t('connected_attachments')}
        <Input
          type="file"
          multiple
          disabled={mutation.isPending}
          onChange={async (event) => {
            const files = Array.from(event.target.files ?? []);
            if (
              files.reduce((sum, file) => sum + file.size, 0) >
              10 * 1024 * 1024
            ) {
              setFileError(t('connected_attachment_limit'));
              return;
            }
            setFileError('');
            const uploaded = await Promise.all(
              files.map(async (file) => {
                const bytes = new Uint8Array(await file.arrayBuffer());
                let binary = '';
                for (const byte of bytes) binary += String.fromCharCode(byte);
                return {
                  filename: file.name,
                  contentType: file.type || 'application/octet-stream',
                  base64: btoa(binary),
                };
              })
            );
            setAttachments(uploaded);
          }}
        />
      </label>
      {mutation.error || fileError ? (
        <p role="alert" className="text-destructive">
          {fileError || mutation.error?.message}
        </p>
      ) : null}
      {draftSaved ? <p role="status">{t('connected_draft_saved')}</p> : null}
      <div className="flex gap-2">
        <Button
          disabled={mutation.isPending || mode === 'edit' || !to.trim()}
          onClick={() => mutation.mutate(false)}
        >
          {t('send')}
        </Button>
        <Button
          variant="outline"
          disabled={mutation.isPending || draftSaved || !to.trim()}
          onClick={() => mutation.mutate(true)}
        >
          {t('connected_save_draft')}
        </Button>
      </div>
    </div>
  );
}
