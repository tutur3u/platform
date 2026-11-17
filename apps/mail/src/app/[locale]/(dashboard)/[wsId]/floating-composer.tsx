'use client';
import {
  createMailDraft,
  type MailMailbox,
  type SendMailMessagePayload,
  updateMailDraft,
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
import {
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { MailComposerAttachments } from './mail-composer-attachments';
import { MailComposerEditor } from './mail-composer-editor';
import { MailComposerFooter } from './mail-composer-footer';
import { MailComposerHeader } from './mail-composer-header';
import { stripPendingMailImages } from './mail-composer-image-nodes';
import type { ComposerSelection } from './mail-composer-selection';
import { MailComposerSendReview } from './mail-composer-send-review';
import type {
  ComposeInitialDraft,
  MailComposerHandle,
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
import { visibleMediaChips } from './mail-composer-upload-state';
import { RecipientField } from './recipient-field';
import { useMailAttachmentCopy } from './use-mail-composer-attachment-copy';
import { useMailComposerKeyboard } from './use-mail-composer-keyboard';
import { useMailComposerUploads } from './use-mail-composer-uploads';

export function FloatingComposer({
  ref,
  initialDraft,
  mailboxes,
  onOpenChange,
  onSend,
  open,
  selectedMailboxId,
  sending,
  workspaceId,
}: {
  ref?: Ref<MailComposerHandle>;
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
  const [dragActive, setDragActive] = useState(false);
  const [online, setOnline] = useState(true);
  const initializedRef = useRef(false);
  const closingRef = useRef(false);
  const draftIdRef = useRef<string | null>(null);
  const dirtyVersionRef = useRef(0);
  const failedSaveVersionRef = useRef<number | null>(null);
  const saveChainRef = useRef<Promise<string | null>>(Promise.resolve(null));
  const ensureDraftRef = useRef<() => Promise<string | null>>(async () => null);
  const markDirtyRef = useRef<() => void>(() => {});
  const mediaBusyRef = useRef(false);
  const uploads = useMailComposerUploads({
    draftIdRef,
    ensureDraft: () => ensureDraftRef.current(),
    mailboxId,
    markDirty: () => markDirtyRef.current(),
    workspaceId,
  });
  const { attachments } = uploads;
  const attachmentCopy = useMailAttachmentCopy({
    ensureDraft: () => ensureDraftRef.current(),
    mailboxId,
    onCopied: uploads.addUploaded,
    onFailed: () => setSaveState('failed'),
    open,
    workspaceId,
  });
  const copying = attachmentCopy.copying;
  const activeMailbox = sendableMailboxes.find(
    (mailbox) => mailbox.id === mailboxId
  );

  useEffect(() => {
    if (!open) {
      initializedRef.current = false;
      uploads.cancelAll();
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
    draftIdRef.current = initialDraft?.draftId ?? null;
    failedSaveVersionRef.current = null;
    uploads.reset(
      initialDraft?.attachments ?? [],
      initialDraft?.draftId
        ? {
            draftId: initialDraft.draftId,
            mailboxId: defaultMailbox.id,
            workspaceId,
          }
        : null
    );
    attachmentCopy.schedule(
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
  }, [
    attachmentCopy.schedule,
    defaultMailbox,
    initialDraft,
    open,
    uploads.cancelAll,
    uploads.reset,
    workspaceId,
  ]);

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
      // Defense in depth: a placeholder never reaches a save or a send.
      bodyHtml: stripPendingMailImages(bodyHtml),
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
  markDirtyRef.current = markDirty;
  ensureDraftRef.current = () => persist(snapshot, true);
  const handleEditorChange = useCallback(
    (value: { html: string; text: string }) => {
      setAiOpen(false);
      setBodyHtml(value.html);
      setBodyText(value.text);
      markDirtyRef.current();
    },
    []
  );
  const openAi = useCallback(() => setAiOpen(true), []);
  const editorAttachments = useMemo(
    () => [...(initialDraft?.quotedAttachments ?? []), ...attachments],
    [attachments, initialDraft?.quotedAttachments]
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
  const mediaBusy = copying || !uploads.settled;
  mediaBusyRef.current = mediaBusy;
  const canSend =
    online &&
    !mediaBusy &&
    combinedRecipients.length > 0 &&
    combinedRecipients.length <= recipientLimit &&
    estimatedBytes <= messageLimit;

  const changeMailbox = async (nextMailboxId: string) => {
    if (!online) {
      setSaveState('offline');
      return;
    }
    markDirty();
    const saved = await persist(snapshot, true);
    if (!saved || uploads.items.length) return;
    draftIdRef.current = null;
    setMailboxId(nextMailboxId);
    setDirty(true);
  };
  const jumpToFailed = () => {
    const retry = composerKeyboard.ref.current?.querySelector<HTMLElement>(
      '[data-mail-upload-retry], [data-chip-retry]'
    );
    retry?.scrollIntoView?.({ block: 'center' });
    retry?.focus();
  };
  const performSend = async () => {
    if (!canSend) return;
    const sendingVersion = dirtyVersionRef.current;
    const savedDraftId = await persist();
    if (dirty && !savedDraftId) {
      toast.error(t('save_failed'));
      return;
    }
    if (dirtyVersionRef.current !== sendingVersion || mediaBusyRef.current)
      return;
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

  const saveAndClose = async (close = true): Promise<boolean> => {
    if (copying || uploads.inFlight || sending || closingRef.current)
      return false;
    if (!dirty) {
      await saveChainRef.current;
      if (close) onOpenChange(false);
      return true;
    }
    if (!online) {
      setSaveState('offline');
      toast.error(t('save_offline'));
      return false;
    }
    const closingVersion = dirtyVersionRef.current;
    closingRef.current = true;
    const savedDraftId = await persist(snapshot, true);
    closingRef.current = false;
    if (!savedDraftId || failedSaveVersionRef.current === closingVersion) {
      toast.error(t('save_failed'));
      return false;
    }
    if (dirtyVersionRef.current !== closingVersion) return false;
    if (close) onOpenChange(false);
    return true;
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

  const composerKeyboard = useMailComposerKeyboard({
    open: open && Boolean(defaultMailbox),
    preferBody: Boolean(initialDraft?.to?.length),
    onSend: () => {
      void requestSend();
    },
    onSave: () => {
      void saveAndClose(false);
    },
    onClose: requestClose,
    onAi: () => {
      setMinimized(false);
      setAiOpen((current) => !current);
    },
  });
  useImperativeHandle(ref, () => ({ save: () => saveAndClose(false) }));
  if (!open || !defaultMailbox) return null;
  return (
    <>
      <section
        ref={composerKeyboard.ref}
        data-mail-composer
        tabIndex={-1}
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
            uploads.addFiles(event.dataTransfer.files);
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
        onKeyDown={composerKeyboard.onKeyDown}
        onPaste={(event) => {
          const files = event.clipboardData.files;
          if (!files.length) return;
          event.preventDefault();
          uploads.addFiles(
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

        {/* Kept mounted while minimized so the editor keeps its identity,
            caret, undo history and any upload placeholders. */}
        <div className={minimized ? 'hidden' : 'contents'}>
          <div className="grid grid-cols-[3.25rem_minmax(0,1fr)] items-center border-dynamic border-b px-3 py-1.5">
            <span className="text-muted-foreground text-xs">{t('from')}</span>
            <Select
              disabled={mediaBusy || uploads.items.length > 0}
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
            mailboxId={mailboxId || undefined}
            workspaceId={workspaceId}
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
              mailboxId={mailboxId || undefined}
              workspaceId={workspaceId}
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
              mailboxId={mailboxId || undefined}
              workspaceId={workspaceId}
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
            attachments={editorAttachments}
            initialHtml={bodyHtml}
            onChange={handleEditorChange}
            onEnhance={openAi}
            onImageNodes={uploads.setNodes}
            onImageNodesChange={uploads.onNodesChange}
            onRemoveImage={uploads.removeImage}
            onRetryImage={uploads.retry}
            onSelectionChange={setSelection}
          />
          <MailComposerAttachments
            items={visibleMediaChips(uploads.items, bodyHtml)}
            onRemove={uploads.remove}
            onRetry={uploads.retry}
          />
          <MailComposerFooter
            announcement={
              uploads.announcement
                ? t(`media_announce_${uploads.announcement.kind}`, {
                    name: uploads.announcement.name,
                  })
                : ''
            }
            selectionOnly={Boolean(selection)}
            aiOpen={aiOpen}
            bodyHtml={selection ? '' : bodyHtml}
            bodyText={selection?.text ?? bodyText}
            canSend={canSend}
            estimatedBytes={estimatedBytes}
            mailboxId={mailboxId}
            mediaFailed={uploads.summary.failed}
            mediaPending={uploads.summary.queued + uploads.summary.uploading}
            messageLimit={messageLimit}
            onAiApply={(result) => {
              if (selection) {
                if (!selection.apply(result.content))
                  toast.error(t('ai_selection_changed'));
                setSelection(null);
                return;
              }
              const nextBodyHtml = applyAiDraftToBody(bodyHtml, result.content);
              setSubject(result.subject);
              setBodyHtml(nextBodyHtml);
              setBodyText(mailHtmlToText(nextBodyHtml));
              markDirty();
            }}
            onAiOpenChange={setAiOpen}
            onJumpToFailed={jumpToFailed}
            onSend={() => void requestSend()}
            onUpload={uploads.addFiles}
            recipientLimit={recipientLimit}
            recipients={combinedRecipients}
            sending={sending}
            subject={subject}
            threadId={initialDraft?.threadId}
            workspaceId={workspaceId}
          />
        </div>
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
