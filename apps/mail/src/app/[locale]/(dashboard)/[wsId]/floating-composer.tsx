'use client';

import { Image as ImageIcon, Paperclip, Send, Trash2 } from '@tuturuuu/icons';
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
import { MailComposerAi } from './mail-composer-ai';
import { MailComposerAttachments } from './mail-composer-attachments';
import { MailComposerEditor } from './mail-composer-editor';
import { MailComposerHeader } from './mail-composer-header';
import type {
  ComposeInitialDraft,
  MailComposerSaveState,
} from './mail-composer-types';
import {
  applyAiDraftToBody,
  buildComposerInitialBody,
  type ComposerWarning,
  formatMailBytes,
  getComposerWarnings,
  getSendableMailboxes,
} from './mail-composer-utils';
import { RecipientField } from './recipient-field';

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
  const sendableMailboxes = getSendableMailboxes(mailboxes);
  const defaultMailbox =
    sendableMailboxes.find((mailbox) => mailbox.id === selectedMailboxId) ??
    sendableMailboxes[0];
  const [mailboxId, setMailboxId] = useState(defaultMailbox?.id ?? '');
  const [to, setTo] = useState<string[]>([]);
  const [cc, setCc] = useState<string[]>([]);
  const [bcc, setBcc] = useState<string[]>([]);
  const [recipientDisplayNames, setRecipientDisplayNames] = useState<
    Record<string, string>
  >({});
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [bodyText, setBodyText] = useState('');
  const [draftId, setDraftId] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<MailAttachment[]>([]);
  const [showCc, setShowCc] = useState(false);
  const [showBcc, setShowBcc] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [sendReviewOpen, setSendReviewOpen] = useState(false);
  const [sendWarnings, setSendWarnings] = useState<ComposerWarning[]>([]);
  const [saveState, setSaveState] = useState<MailComposerSaveState>('idle');
  const [dirty, setDirty] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [online, setOnline] = useState(true);
  const [imageUrlToInsert, setImageUrlToInsert] = useState<string | null>(null);
  const [pendingAttachmentCopy, setPendingAttachmentCopy] = useState<{
    attachmentIds: string[];
    sourceMessageId: string;
  } | null>(null);
  const draftIdRef = useRef<string | null>(null);
  const dirtyVersionRef = useRef(0);
  const saveChainRef = useRef<Promise<string | null>>(Promise.resolve(null));
  const activeMailbox = sendableMailboxes.find(
    (mailbox) => mailbox.id === mailboxId
  );

  useEffect(() => {
    if (!open || !defaultMailbox) return;
    const initialBody = buildComposerInitialBody(initialDraft, defaultMailbox);
    setMailboxId(defaultMailbox?.id ?? '');
    setTo(initialDraft?.to ?? []);
    setCc(initialDraft?.cc ?? []);
    setBcc(initialDraft?.bcc ?? []);
    setShowCc(Boolean(initialDraft?.cc?.length));
    setShowBcc(Boolean(initialDraft?.bcc?.length));
    setRecipientDisplayNames(initialDraft?.recipientDisplayNames ?? {});
    setSubject(initialDraft?.subject ?? '');
    setBodyHtml(initialBody.html);
    setBodyText(initialBody.text);
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
    setSendReviewOpen(false);
    setSendWarnings([]);
    setDirty(Boolean(initialDraft));
    dirtyVersionRef.current = initialDraft ? 1 : 0;
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
      recipientDisplayNames,
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
      recipientDisplayNames,
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
      const savingVersion = dirtyVersionRef.current;
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
          if (dirtyVersionRef.current === savingVersion) setDirty(false);
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

  const markDirty = () => {
    dirtyVersionRef.current += 1;
    setDirty(true);
  };

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
    markDirty();
  };

  const uploadFiles = async (files: FileList | File[], inline = false) => {
    markDirty();
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

  const performSend = async () => {
    if (!canSend) return;
    const savedDraftId = await persist();
    await onSend(mailboxId, { ...snapshot, draftId: savedDraftId });
    onOpenChange(false);
  };

  const requestSend = async () => {
    if (!canSend) return;
    const warnings = getComposerWarnings({
      attachmentCount: attachments.length,
      bodyHtml,
      signatureHtml: activeMailbox?.signatureHtml,
      signatureText: activeMailbox?.signatureText,
      subject,
    });
    if (warnings.length > 0) {
      setSendWarnings(warnings);
      setSendReviewOpen(true);
      return;
    }
    await performSend();
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
          setDragActive(false);
          if (event.dataTransfer.files.length)
            void uploadFiles(event.dataTransfer.files);
        }}
        onDragEnter={(event) => {
          event.preventDefault();
          if (event.dataTransfer.types.includes('Files')) setDragActive(true);
        }}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            setDragActive(false);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void requestSend();
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
        {dragActive && !minimized ? (
          <div className="pointer-events-none absolute inset-3 z-20 flex items-center justify-center rounded-xl border-2 border-foreground/30 border-dashed bg-background/90 backdrop-blur-sm">
            <div className="rounded-xl bg-foreground/[0.06] px-5 py-3 font-medium text-sm">
              {t('drop_files_to_attach')}
            </div>
          </div>
        ) : null}
        <MailComposerHeader
          closeLabel={t('close')}
          maximizeLabel={t('maximize')}
          maximized={maximized}
          minimized={minimized}
          minimizeLabel={t('minimize')}
          newMessageLabel={t('new_message')}
          onClose={() => void saveAndClose()}
          onMaximize={() => {
            setMinimized(false);
            setMaximized(!maximized);
          }}
          onMinimize={() => {
            setMaximized(false);
            setMinimized(!minimized);
          }}
          restoreLabel={t('restore')}
          saveLabel={t(`save_${saveState}`)}
          subject={subject}
          windowOptionsLabel={t('composer_window_options')}
        />

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
              actions={
                <>
                  <Button
                    className="h-7 px-2 text-xs"
                    onClick={() => setShowCc((current) => !current)}
                    type="button"
                    variant={showCc ? 'secondary' : 'ghost'}
                  >
                    {t('cc')}
                  </Button>
                  <Button
                    className="h-7 px-2 text-xs"
                    onClick={() => setShowBcc((current) => !current)}
                    type="button"
                    variant={showBcc ? 'secondary' : 'ghost'}
                  >
                    {t('bcc')}
                  </Button>
                </>
              }
              disabledAddresses={[...cc, ...bcc]}
              displayNames={recipientDisplayNames}
              label={t('to')}
              onChange={(value) => {
                setTo(value);
                markDirty();
              }}
              onDisplayNamesChange={(names) => {
                setRecipientDisplayNames((current) => ({
                  ...current,
                  ...names,
                }));
                markDirty();
              }}
              recipients={to}
              removeLabel={(address) => t('remove_recipient', { address })}
            />
            {showCc ? (
              <RecipientField
                disabledAddresses={[...to, ...bcc]}
                displayNames={recipientDisplayNames}
                label={t('cc')}
                onChange={(value) => {
                  setCc(value);
                  markDirty();
                }}
                onDisplayNamesChange={(names) => {
                  setRecipientDisplayNames((current) => ({
                    ...current,
                    ...names,
                  }));
                  markDirty();
                }}
                recipients={cc}
                removeLabel={(address) => t('remove_recipient', { address })}
              />
            ) : null}
            {showBcc ? (
              <RecipientField
                disabledAddresses={[...to, ...cc]}
                displayNames={recipientDisplayNames}
                label={t('bcc')}
                onChange={(value) => {
                  setBcc(value);
                  markDirty();
                }}
                onDisplayNamesChange={(names) => {
                  setRecipientDisplayNames((current) => ({
                    ...current,
                    ...names,
                  }));
                  markDirty();
                }}
                recipients={bcc}
                removeLabel={(address) => t('remove_recipient', { address })}
              />
            ) : null}
            <Input
              className="h-11 rounded-none border-x-0 border-t-0 px-4 font-semibold shadow-none outline-none focus-visible:outline-none focus-visible:ring-0"
              onChange={(event) => {
                setSubject(event.target.value);
                markDirty();
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
                markDirty();
              }}
            />
            <MailComposerAttachments
              attachments={attachments}
              onRemove={async (attachment) => {
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
              removeLabel={t('remove_attachment')}
            />
            <footer className="flex items-center gap-2 border-dynamic border-t px-3 py-2.5">
              <Button
                disabled={!canSend || sending}
                onClick={() => void requestSend()}
              >
                <Send className="size-4" /> {sending ? t('sending') : t('send')}
              </Button>
              <MailComposerAi
                bodyHtml={bodyHtml}
                bodyText={bodyText}
                mailboxId={mailboxId}
                onApply={(result) => {
                  setSubject(result.subject);
                  setBodyHtml(applyAiDraftToBody(bodyHtml, result.content));
                  setBodyText(result.content);
                  markDirty();
                }}
                recipients={combinedRecipients}
                subject={subject}
                threadId={initialDraft?.threadId}
                workspaceId={workspaceId}
              />
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
                {formatMailBytes(estimatedBytes)}/
                {formatMailBytes(messageLimit)}
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

      <AlertDialog onOpenChange={setSendReviewOpen} open={sendReviewOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('review_before_sending')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('review_before_sending_description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="space-y-2 rounded-xl bg-foreground/[0.04] p-3 text-sm">
            {sendWarnings.map((warning) => (
              <li className="flex gap-2" key={warning}>
                <span aria-hidden="true" className="text-muted-foreground">
                  &bull;
                </span>
                {t(`warning_${warning}`)}
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('continue_editing')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void performSend()}>
              {t('send_anyway')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
