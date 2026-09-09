'use client';

import {
  copyMailDraftAttachments,
  createMailDraft,
  deleteMailDraftAttachment,
  type MailAttachment,
  type MailMailbox,
  type SendMailMessagePayload,
  updateMailDraft,
  uploadMailDraftAttachment,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tuturuuu/ui/select';
import { toast } from '@tuturuuu/ui/sonner';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MailComposerAttachments } from './mail-composer-attachments';
import { MailComposerEditor } from './mail-composer-editor';
import { MailComposerFooter } from './mail-composer-footer';
import { MailComposerHeader } from './mail-composer-header';
import type { ComposerSelection } from './mail-composer-selection';
import { MailComposerSendReview } from './mail-composer-send-review';
import type {
  ComposeInitialDraft,
  MailComposerSaveState,
} from './mail-composer-types';
import {
  applyAiDraftToBody,
  buildComposerInitialBody,
  type ComposerWarning,
  getComposerWarnings,
  getSendableMailboxes,
  mailHtmlToText,
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
    sendableMailboxes.find(
      (mailbox) => mailbox.id === (initialDraft?.mailboxId ?? selectedMailboxId)
    ) ?? sendableMailboxes[0];
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
  const [selection, setSelection] = useState<ComposerSelection | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
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
  const initializedRef = useRef(false);
  const closingRef = useRef(false);
  const draftIdRef = useRef<string | null>(null);
  const dirtyVersionRef = useRef(0);
  const failedSaveVersionRef = useRef<number | null>(null);
  const saveChainRef = useRef<Promise<string | null>>(Promise.resolve(null));
  const activeMailbox = sendableMailboxes.find(
    (mailbox) => mailbox.id === mailboxId
  );

  useEffect(() => {
    if (!open) {
      initializedRef.current = false;
      return;
    }
    if (!defaultMailbox || initializedRef.current) return;
    initializedRef.current = true;
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
    setDraftId(initialDraft?.draftId ?? null);
    draftIdRef.current = initialDraft?.draftId ?? null;
    failedSaveVersionRef.current = null;
    setAttachments(initialDraft?.attachments ?? []);
    setPendingAttachmentCopy(
      initialDraft?.sourceMessageId && initialDraft.sourceAttachmentIds?.length
        ? {
            attachmentIds: initialDraft.sourceAttachmentIds,
            sourceMessageId: initialDraft.sourceMessageId,
          }
        : null
    );
    setSaveState(initialDraft?.draftId ? 'saved' : 'idle');
    setSendReviewOpen(false);
    setAiOpen(false);
    setSelection(null);
    setSendWarnings([]);
    setDirty(Boolean(initialDraft && !initialDraft.draftId));
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
          if (failedSaveVersionRef.current === savingVersion) {
            failedSaveVersionRef.current = null;
          }
          if (dirtyVersionRef.current === savingVersion) setDirty(false);
          return response.message.id;
        })
        .catch(() => {
          failedSaveVersionRef.current = savingVersion;
          setSaveState('failed');
          return null;
        });
      return saveChainRef.current;
    },
    [dirty, mailboxId, online, snapshot, workspaceId]
  );

  const markDirty = () => {
    dirtyVersionRef.current += 1;
    setSaveState(online ? 'saving' : 'offline');
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
    const saved = await persist(snapshot, true);
    if (!saved || attachments.length) return;
    draftIdRef.current = null;
    setDraftId(null);
    setAttachments([]);
    setMailboxId(nextMailboxId);
    markDirty();
  };

  const uploadFiles = async (files: FileList | File[], inline = false) => {
    markDirty();
    setUploading(true);
    try {
      const savedDraftId = await persist(snapshot, true);
      if (!savedDraftId) return;
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
    if (!canSend || uploading) return;
    const savedDraftId = await persist();
    if (dirty && !savedDraftId) {
      toast.error(t('save_failed'));
      return;
    }
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
    if (uploading || sending || closingRef.current) return;
    if (!dirty) {
      await saveChainRef.current;
      onOpenChange(false);
      return;
    }
    if (!online) {
      setSaveState('offline');
      toast.error(t('save_offline'));
      return;
    }
    const closingVersion = dirtyVersionRef.current;
    closingRef.current = true;
    const savedDraftId = await persist(snapshot, true);
    closingRef.current = false;
    if (!savedDraftId || failedSaveVersionRef.current === closingVersion) {
      toast.error(t('save_failed'));
      return;
    }
    if (dirtyVersionRef.current !== closingVersion) return;
    onOpenChange(false);
  };

  const requestClose = () => {
    void saveAndClose();
  };

  const toggleComposerSize = () => {
    if (minimized) {
      setMinimized(false);
      return;
    }
    setMaximized((current) => !current);
  };

  return (
    <>
      <section
        aria-label={t('new_message')}
        className={cn(
          'fixed z-50 flex flex-col overflow-hidden border border-dynamic bg-background shadow-2xl',
          minimized
            ? 'right-0 bottom-0 left-0 h-14 md:right-5 md:bottom-5 md:left-auto md:w-[28rem] md:rounded-2xl'
            : maximized
              ? 'inset-0 h-dvh w-full md:inset-6 md:h-auto md:w-auto md:rounded-xl'
              : 'inset-0 h-dvh w-full md:inset-auto md:right-5 md:bottom-5 md:h-[min(78dvh,48rem)] md:min-h-[28rem] md:w-[min(46rem,calc(100vw-2.5rem))] md:min-w-[28rem] md:resize md:rounded-xl'
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
          if (
            event.defaultPrevented ||
            !event.currentTarget.contains(event.target as Node)
          )
            return;
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            void requestSend();
          }
          if (
            event.key.toLowerCase() === 'j' &&
            (event.metaKey || event.ctrlKey)
          ) {
            event.preventDefault();
            setMinimized(false);
            setAiOpen((current) => !current);
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            requestClose();
          }
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
          closeLabel={t('save_and_close')}
          maximizeLabel={t('maximize')}
          maximized={maximized}
          minimized={minimized}
          newMessageLabel={t('new_message')}
          minimizeLabel={t('minimize')}
          onMinimize={() => {
            setMaximized(false);
            setMinimized(true);
            setAiOpen(false);
          }}
          onRequestClose={requestClose}
          onToggleSize={toggleComposerSize}
          restoreLabel={t('restore')}
          saveLabel={t(`save_${saveState}`)}
          subject={subject}
        />

        {!minimized ? (
          <>
            <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center border-dynamic border-b px-3 py-1.5">
              <span className="text-muted-foreground text-xs">{t('from')}</span>
              <Select
                disabled={uploading || attachments.length > 0}
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
              onSelectionChange={setSelection}
              onEnhance={() => setAiOpen(true)}
              imageUrlToInsert={imageUrlToInsert}
              initialHtml={bodyHtml}
              onImageInserted={() => setImageUrlToInsert(null)}
              onChange={(value) => {
                setAiOpen(false);
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
            <MailComposerFooter
              selectionOnly={Boolean(selection)}
              aiOpen={aiOpen}
              bodyHtml={selection ? '' : bodyHtml}
              bodyText={selection?.text ?? bodyText}
              canSend={canSend}
              estimatedBytes={estimatedBytes}
              mailboxId={mailboxId}
              messageLimit={messageLimit}
              onAiApply={(result) => {
                if (selection) {
                  if (!selection.apply(result.content))
                    toast.error(t('ai_selection_changed'));
                  setSelection(null);
                  return;
                }
                const nextBodyHtml = applyAiDraftToBody(
                  bodyHtml,
                  result.content
                );
                setSubject(result.subject);
                setBodyHtml(nextBodyHtml);
                setBodyText(mailHtmlToText(nextBodyHtml));
                markDirty();
              }}
              onAiOpenChange={setAiOpen}
              onSend={() => void requestSend()}
              onUpload={(files, inline) => void uploadFiles(files, inline)}
              recipientLimit={recipientLimit}
              recipients={combinedRecipients}
              sending={sending}
              subject={subject}
              threadId={initialDraft?.threadId}
              uploading={uploading}
              workspaceId={workspaceId}
            />
          </>
        ) : null}
      </section>

      <MailComposerSendReview
        cancelLabel={t('continue_editing')}
        description={t('review_before_sending_description')}
        onConfirm={() => void performSend()}
        onOpenChange={setSendReviewOpen}
        open={sendReviewOpen}
        sendLabel={t('send_anyway')}
        title={t('review_before_sending')}
        warningLabel={(warning) => t(`warning_${warning}`)}
        warnings={sendWarnings}
      />
    </>
  );
}
