'use client';

import {
  Image as ImageIcon,
  Maximize2,
  Minimize2,
  Paperclip,
  Send,
  Trash2,
  X,
} from '@tuturuuu/icons';
import {
  copyMailDraftAttachments,
  createMailDraft,
  deleteMailDraft,
  deleteMailDraftAttachment,
  type MailAttachment,
  type MailMailbox,
  type SendMailMessagePayload,
  updateMailDraft,
  uploadMailDraftAttachment,
} from '@tuturuuu/internal-api';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@tuturuuu/ui/alert-dialog';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MailComposerEditor } from './mail-composer-editor';
import { RecipientField } from './recipient-field';

export interface ComposeInitialDraft {
  bcc?: string[];
  bodyHtml?: string;
  bodyText?: string;
  cc?: string[];
  inReplyTo?: string | null;
  references?: string[];
  sourceAttachmentIds?: string[];
  sourceMessageId?: string;
  subject?: string;
  to?: string[];
}

type SaveState = 'failed' | 'idle' | 'offline' | 'saved' | 'saving';

export function FloatingComposer({
  initialDraft,
  mailboxes,
  onOpenChange,
  onSend,
  open,
  selectedMailboxId,
  sending,
  workspaceId,
}: {
  initialDraft?: ComposeInitialDraft | null;
  mailboxes: MailMailbox[];
  onOpenChange: (open: boolean) => void;
  onSend: (mailboxId: string, payload: SendMailMessagePayload) => Promise<void>;
  open: boolean;
  selectedMailboxId: string | null;
  sending: boolean;
  workspaceId: string;
}) {
  const t = useTranslations('mail');
  const sendableMailboxes = useMemo(
    () =>
      mailboxes.filter((mailbox) =>
        ['admin', 'owner', 'sender'].includes(mailbox.role)
      ),
    [mailboxes]
  );
  const defaultMailbox =
    sendableMailboxes.find((mailbox) => mailbox.id === selectedMailboxId) ??
    sendableMailboxes[0];
  const [mailboxId, setMailboxId] = useState(defaultMailbox?.id ?? '');
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [draftId, setDraftId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<MailAttachment[]>([]);
  const [showCopies, setShowCopies] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [online, setOnline] = useState(true);
  const [imageUrlToInsert, setImageUrlToInsert] = useState<string | null>(null);
  const [pendingAttachmentCopy, setPendingAttachmentCopy] = useState<{
    attachmentIds: string[];
    sourceMessageId: string;
  } | null>(null);
  const draftIdRef = useRef<string | null>(null);
  const saveChainRef = useRef<Promise<string | null>>(Promise.resolve(null));
  const activeMailbox = sendableMailboxes.find(
    (mailbox) => mailbox.id === mailboxId
  );

  useEffect(() => {
    if (!open) return;
    const signature = defaultMailbox?.signatureHtml ?? '';
    const initialHtml = initialDraft?.bodyHtml ?? signature;
    setMailboxId(defaultMailbox?.id ?? '');
    setTo(initialDraft?.to ?? []);
    setCc(initialDraft?.cc ?? []);
    setBcc(initialDraft?.bcc ?? []);
    setSubject(initialDraft?.subject ?? '');
    setBodyHtml(initialHtml);
    setBodyText(initialDraft?.bodyText ?? defaultMailbox?.signatureText ?? '');
    setDraftId(null);
    draftIdRef.current = null;
    setAttachments([]);
    setPendingAttachmentCopy(
      initialDraft?.sourceMessageId && initialDraft.sourceAttachmentIds?.length
        ? {
            attachmentIds: initialDraft.sourceAttachmentIds,
            sourceMessageId: initialDraft.sourceMessageId,
          }
        : null
    );
    setSaveState('idle');
    setDirty(Boolean(initialDraft));
    setMinimized(false);
  }, [defaultMailbox, initialDraft, open]);

  useEffect(() => {
    const updateOnlineState = () => setOnline(window.navigator.onLine);
    updateOnlineState();
    window.addEventListener('online', updateOnlineState);
    window.addEventListener('offline', updateOnlineState);
    return () => {
      window.removeEventListener('online', updateOnlineState);
      window.removeEventListener('offline', updateOnlineState);
    };
  }, []);

  const snapshot = useMemo(
    () => ({
      bcc,
      bodyHtml,
      bodyText,
      cc,
      inReplyTo: initialDraft?.inReplyTo,
      references: initialDraft?.references,
      subject,
      to,
    }),
    [
      bcc,
      bodyHtml,
      bodyText,
      cc,
      initialDraft?.inReplyTo,
      initialDraft?.references,
      subject,
      to,
    ]
  );

  const persist = useCallback(
    (nextSnapshot = snapshot, force = false) => {
      if (!mailboxId || (!dirty && !force))
        return Promise.resolve(draftIdRef.current);
      if (!online) {
        setSaveState('offline');
        return Promise.resolve(draftIdRef.current);
      }
      setSaveState('saving');
      saveChainRef.current = saveChainRef.current
        .catch(() => draftIdRef.current)
        .then(async () => {
          const currentId = draftIdRef.current;
          const response = currentId
            ? await updateMailDraft(
                workspaceId,
                mailboxId,
                currentId,
                nextSnapshot
              )
            : await createMailDraft(workspaceId, mailboxId, nextSnapshot);
          draftIdRef.current = response.message.id;
          setDraftId(response.message.id);
          setSaveState('saved');
          return response.message.id;
        })
        .catch(() => {
          setSaveState('failed');
          return draftIdRef.current;
        });
      return saveChainRef.current;
    },
    [dirty, mailboxId, online, snapshot, workspaceId]
  );

  useEffect(() => {
    if (!open || !dirty || !mailboxId) return;
    const timer = window.setTimeout(() => void persist(), 750);
    return () => window.clearTimeout(timer);
  }, [dirty, mailboxId, open, persist]);

  useEffect(() => {
    if (!open || !dirty || !online || saveState !== 'failed') return;
    const timer = window.setTimeout(() => void persist(), 3000);
    return () => window.clearTimeout(timer);
  }, [dirty, online, open, persist, saveState]);

  useEffect(() => {
    if (online && saveState === 'offline' && dirty) void persist();
  }, [dirty, online, persist, saveState]);

  useEffect(() => {
    if (!open || !pendingAttachmentCopy || !mailboxId) return;
    const copy = pendingAttachmentCopy;
    setPendingAttachmentCopy(null);
    void (async () => {
      setUploading(true);
      try {
        const savedDraftId = await persist(snapshot, true);
        if (!savedDraftId) return;
        const response = await copyMailDraftAttachments(
          workspaceId,
          mailboxId,
          savedDraftId,
          copy
        );
        setAttachments((current) => [...current, ...response.attachments]);
      } catch {
        setSaveState('failed');
      } finally {
        setUploading(false);
      }
    })();
  }, [mailboxId, open, pendingAttachmentCopy, persist, snapshot, workspaceId]);

  if (!open || !defaultMailbox) return null;
  const combinedRecipients = [...to, ...cc, ...bcc];
  const recipientLimit = activeMailbox?.providerLimits.maxRecipients ?? 50;
  const messageLimit =
    activeMailbox?.providerLimits.maxMessageBytes ?? 5 * 1024 * 1024;
  const estimatedBytes =
    new Blob([subject, bodyHtml, bodyText]).size +
    2048 +
    attachments.reduce(
      (total, attachment) =>
        total + Math.ceil(attachment.sizeBytes / 3) * 4 + 512,
      0
    );
  const canSend =
    online &&
    combinedRecipients.length > 0 &&
    combinedRecipients.length <= recipientLimit &&
    estimatedBytes <= messageLimit;

  const changeMailbox = async (nextMailboxId: string) => {
    if (!online) {
      setSaveState('offline');
      return;
    }
    await persist(snapshot, true);
    draftIdRef.current = null;
    setDraftId(null);
    setAttachments([]);
    setMailboxId(nextMailboxId);
    setDirty(true);
  };

  const uploadFiles = async (files: FileList | File[], inline = false) => {
    setDirty(true);
    const savedDraftId = await persist(snapshot, true);
    if (!savedDraftId) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const contentId = inline
          ? `${crypto.randomUUID()}@tuturuuu.mail`
          : null;
        const response = await uploadMailDraftAttachment(
          workspaceId,
          mailboxId,
          savedDraftId,
          file,
          file.name,
          { contentId, disposition: inline ? 'inline' : 'attachment' }
        );
        setAttachments((current) => [...current, response.attachment]);
        if (inline) {
          setImageUrlToInsert(
            `/api/v1/workspaces/${workspaceId}/mail/mailboxes/${mailboxId}/drafts/${savedDraftId}/attachments/${response.attachment.id}`
          );
        }
      }
    } finally {
      setUploading(false);
    }
  };

  const send = async () => {
    if (!canSend) return;
    const savedDraftId = await persist();
    await onSend(mailboxId, { ...snapshot, draftId: savedDraftId });
    onOpenChange(false);
  };

  const saveAndClose = async () => {
    if (!online) {
      setSaveState('offline');
      return;
    }
    await persist(snapshot, true);
    onOpenChange(false);
  };

  return (
    <>
      <section
        aria-label={t('new_message')}
        className={cn(
          'fixed z-50 flex flex-col overflow-hidden border border-dynamic bg-background shadow-2xl max-md:inset-0 md:right-5 md:bottom-5 md:rounded-2xl',
          minimized
            ? 'h-14 md:w-[28rem]'
            : 'h-[min(78vh,48rem)] w-[min(46rem,calc(100vw-2.5rem))] resize md:min-h-[28rem] md:min-w-[28rem]',
          maximized && 'inset-3 h-auto w-auto resize-none md:rounded-2xl'
        )}
        onDrop={(event) => {
          event.preventDefault();
          if (event.dataTransfer.files.length)
            void uploadFiles(event.dataTransfer.files);
        }}
        onDragOver={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void send();
          }
          if (event.key === 'Escape') setMinimized(true);
        }}
        onPaste={(event) => {
          const files = event.clipboardData.files;
          if (!files.length) return;
          event.preventDefault();
          void uploadFiles(
            files,
            Array.from(files).every((file) => file.type.startsWith('image/'))
          );
        }}
        role="dialog"
      >
        <header className="flex h-14 shrink-0 items-center gap-2 border-dynamic border-b px-3">
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold text-sm">
              {subject || t('new_message')}
            </div>
            <div className="text-[0.68rem] text-muted-foreground">
              {t(`save_${saveState}`)}
            </div>
          </div>
          <Button
            aria-label={t('minimize')}
            onClick={() => setMinimized(!minimized)}
            size="icon"
            variant="ghost"
          >
            <Minimize2 className="size-4" />
          </Button>
          <Button
            aria-label={t('maximize')}
            className="max-md:hidden"
            onClick={() => setMaximized(!maximized)}
            size="icon"
            variant="ghost"
          >
            <Maximize2 className="size-4" />
          </Button>
          <Button
            aria-label={t('close')}
            onClick={() => void saveAndClose()}
            size="icon"
            variant="ghost"
          >
            <X className="size-4" />
          </Button>
        </header>

        {!minimized ? (
          <>
            <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center border-dynamic border-b px-3 py-1.5">
              <span className="text-muted-foreground text-xs">{t('from')}</span>
              <Select
                value={mailboxId}
                onValueChange={(value) => void changeMailbox(value)}
              >
                <SelectTrigger className="h-8 border-0 px-1 shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sendableMailboxes.map((mailbox) => (
                    <SelectItem key={mailbox.id} value={mailbox.id}>
                      {mailbox.displayName} · {mailbox.address}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <RecipientField
              disabledAddresses={[...cc, ...bcc]}
              label={t('to')}
              onChange={(value) => {
                setTo(value);
                setDirty(true);
              }}
              recipients={to}
              removeLabel={(address) => t('remove_recipient', { address })}
            />
            {showCopies ? (
              <>
                <RecipientField
                  disabledAddresses={[...to, ...bcc]}
                  label={t('cc')}
                  onChange={(value) => {
                    setCc(value);
                    setDirty(true);
                  }}
                  recipients={cc}
                  removeLabel={(address) => t('remove_recipient', { address })}
                />
                <RecipientField
                  disabledAddresses={[...to, ...cc]}
                  label={t('bcc')}
                  onChange={(value) => {
                    setBcc(value);
                    setDirty(true);
                  }}
                  recipients={bcc}
                  removeLabel={(address) => t('remove_recipient', { address })}
                />
              </>
            ) : (
              <button
                className="self-end px-4 py-1 text-muted-foreground text-xs hover:text-foreground"
                onClick={() => setShowCopies(true)}
                type="button"
              >
                {t('add_cc_bcc')}
              </button>
            )}
            <Input
              className="h-11 rounded-none border-x-0 border-t-0 px-4 font-medium shadow-none focus-visible:ring-0"
              onChange={(event) => {
                setSubject(event.target.value);
                setDirty(true);
              }}
              placeholder={t('subject')}
              value={subject}
            />
            <MailComposerEditor
              imageUrlToInsert={imageUrlToInsert}
              initialHtml={bodyHtml}
              onImageInserted={() => setImageUrlToInsert(null)}
              onChange={(value) => {
                setBodyHtml(value.html);
                setBodyText(value.text);
                setDirty(true);
              }}
            />
            {attachments.length > 0 ? (
              <div className="flex flex-wrap gap-2 border-dynamic border-t px-3 py-2">
                {attachments.map((attachment) => (
                  <div
                    className="flex items-center gap-2 rounded-lg bg-foreground/[0.05] px-2 py-1 text-xs"
                    key={attachment.id}
                  >
                    <Paperclip className="size-3" />
                    <span className="max-w-44 truncate">
                      {attachment.filename}
                    </span>
                    <button
                      aria-label={t('remove_attachment')}
                      onClick={async () => {
                        if (!draftId) return;
                        await deleteMailDraftAttachment(
                          workspaceId,
                          mailboxId,
                          draftId,
                          attachment.id
                        );
                        setAttachments((items) =>
                          items.filter((item) => item.id !== attachment.id)
                        );
                      }}
                      type="button"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <footer className="flex items-center gap-2 border-dynamic border-t px-3 py-2.5">
              <Button disabled={!canSend || sending} onClick={send}>
                <Send className="size-4" /> {sending ? t('sending') : t('send')}
              </Button>
              <label className="inline-flex cursor-pointer">
                <input
                  aria-label={t('attach_files')}
                  className="sr-only"
                  multiple
                  onChange={(event) =>
                    event.target.files && void uploadFiles(event.target.files)
                  }
                  type="file"
                />
                <Button asChild size="icon" variant="ghost">
                  <span>
                    <Paperclip className="size-4" />
                  </span>
                </Button>
              </label>
              <label className="inline-flex cursor-pointer">
                <input
                  accept="image/*"
                  aria-label={t('insert_images')}
                  className="sr-only"
                  multiple
                  onChange={(event) =>
                    event.target.files &&
                    void uploadFiles(event.target.files, true)
                  }
                  type="file"
                />
                <Button asChild size="icon" variant="ghost">
                  <span>
                    <ImageIcon className="size-4" />
                  </span>
                </Button>
              </label>
              <span className="ml-auto text-muted-foreground text-xs tabular-nums">
                {combinedRecipients.length}/{recipientLimit} ·{' '}
                {formatBytes(estimatedBytes)}/{formatBytes(messageLimit)}
                {uploading ? ` · ${t('uploading')}` : ''}
              </span>
              <Button
                aria-label={t('discard')}
                onClick={() => setDiscardOpen(true)}
                size="icon"
                variant="ghost"
              >
                <Trash2 className="size-4" />
              </Button>
            </footer>
          </>
        ) : null}
      </section>

      <AlertDialog onOpenChange={setDiscardOpen} open={discardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('discard_draft')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('discard_draft_description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('keep_draft')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                const current = draftIdRef.current;
                if (current)
                  await deleteMailDraft(workspaceId, mailboxId, current);
                onOpenChange(false);
              }}
            >
              {t('discard')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
