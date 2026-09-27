'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Editor, JSONContent } from '@tiptap/react';
import {
  Archive,
  ArrowLeft,
  Lock,
  LockOpen,
  NotebookPen,
  Plus,
  Search,
} from '@tuturuuu/icons';
import {
  createWorkspaceNote,
  listWorkspaceNotes,
  updateWorkspaceNote,
  type WorkspaceNote,
} from '@tuturuuu/internal-api/notes';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { useLocale, useTranslations } from 'next-intl';
import { type MouseEvent, useCallback, useMemo, useRef, useState } from 'react';
import { getCalendarAppOrigin } from '@/lib/calendar-app-url';
import { getFinanceAppOrigin } from '@/lib/finance-app-url';
import { getMeetAppOrigin } from '@/lib/meet-app-url';
import { getTasksAppUrlClient } from '@/lib/tasks-app-url-client';
import { NoteEntityPicker } from './note-entity-picker';
import {
  recoverNoteKeyWithPasskey,
  transferNoteKey,
} from './note-key-transfer';
import {
  decryptNote,
  encryptNote,
  isDeviceLockedNote,
  noteLockEnvelope,
} from './note-lock';
import { NoteLockPlaceholder } from './note-lock-placeholder';
import { NotePassphraseDialog } from './note-passphrase-dialog';
import { NoteTaskConversionDialog } from './note-task-conversion-dialog';

const emptyDoc: JSONContent = { type: 'doc', content: [] };

function excerpt(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const value = node as { text?: unknown; content?: unknown };
  const text = typeof value.text === 'string' ? value.text : '';
  return (
    text +
    (Array.isArray(value.content) ? value.content.map(excerpt).join(' ') : '')
  );
}

export function NotesClient({ wsId }: { wsId: string }) {
  const t = useTranslations('notes_app');
  const locale = useLocale();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'inbox' | 'archive'>('inbox');
  const queryKey = useMemo(
    () => ['workspace', wsId, 'notes', tab] as const,
    [wsId, tab]
  );
  const inboxQueryKey = useMemo(
    () => ['workspace', wsId, 'notes', 'inbox'] as const,
    [wsId]
  );
  const {
    data: notes = [],
    isLoading,
    error,
  } = useQuery({
    queryKey,
    queryFn: () => listWorkspaceNotes(wsId, { archived: tab === 'archive' }),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [taskDraft, setTaskDraft] = useState<{
    name: string;
    from: number;
    to: number;
  } | null>(null);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState<JSONContent>(emptyDoc);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [taskSelectionError, setTaskSelectionError] = useState(false);
  const [lockedNote, setLockedNote] = useState<WorkspaceNote | null>(null);
  const [lockDialog, setLockDialog] = useState<'lock' | 'open' | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [recoveryError, setRecoveryError] = useState(false);
  const [transferQr, setTransferQr] = useState<string | null>(null);
  const transferToken = useRef(0);
  const passphraseRef = useRef<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<Editor | null>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const pending = useRef<{
    id: string;
    title: string;
    content: JSONContent;
  } | null>(null);

  const updateList = useCallback(
    (updated: WorkspaceNote) => {
      queryClient.setQueryData<WorkspaceNote[]>(queryKey, (current = []) =>
        current.map((note) => (note.id === updated.id ? updated : note))
      );
    },
    [queryClient, queryKey]
  );

  const savePending = useCallback(async (): Promise<boolean> => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (inFlight.current) {
      const saved = await inFlight.current;
      return saved && (pending.current ? savePending() : true);
    }
    const draft = pending.current;
    if (!draft) return true;
    pending.current = null;
    setSaving(true);
    const request = (async () => {
      const storedContent = lockedNote
        ? await encryptNote(draft.content, passphraseRef.current ?? '')
        : draft.content;
      const recovery = noteLockEnvelope(lockedNote?.content)?.recovery;
      if (lockedNote && recovery && isDeviceLockedNote(lockedNote.content)) {
        (storedContent as JSONContent).attrs = {
          ...(storedContent as JSONContent).attrs,
          tuturuuuLock: {
            ...noteLockEnvelope(storedContent),
            mode: 'device',
            recovery,
            lockId: noteLockEnvelope(lockedNote.content)?.lockId,
          },
        };
      }
      return updateWorkspaceNote(wsId, draft.id, {
        title: draft.title,
        content: storedContent as Record<string, unknown>,
      });
    })();
    const savingRequest = request.then(
      () => true,
      () => false
    );
    inFlight.current = savingRequest;
    let succeeded = false;
    try {
      const saved = await request;
      updateList(saved);
      setSaveError(false);
      succeeded = true;
      return true;
    } catch {
      if (!pending.current) pending.current = draft;
      setSaveError(true);
      return false;
    } finally {
      inFlight.current = null;
      setSaving(false);
      if (succeeded && pending.current && !timer.current) {
        timer.current = setTimeout(() => {
          void savePending();
        }, 700);
      }
    }
  }, [lockedNote, updateList, wsId]);

  const scheduleSave = (draft: {
    id: string;
    title: string;
    content: JSONContent;
  }) => {
    pending.current = draft;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void savePending();
    }, 700);
  };

  const selectNote = async (note: WorkspaceNote) => {
    if (!(await savePending())) return;
    setSelectedId(note.id);
    setTitle(note.title ?? '');
    passphraseRef.current = null;
    setRecoveryError(false);
    setRecovering(false);
    setTransferQr(null);
    transferToken.current++;
    setLockedNote(noteLockEnvelope(note.content) ? note : null);
    setContent(
      noteLockEnvelope(note.content)
        ? emptyDoc
        : ((note.content as JSONContent) ?? emptyDoc)
    );
    if (noteLockEnvelope(note.content) && !isDeviceLockedNote(note.content)) {
      setLockDialog('open');
    }
  };

  const createNote = async () => {
    if (!(await savePending())) return;
    try {
      const note = await createWorkspaceNote(wsId, {
        title: '',
        content: emptyDoc,
      });
      queryClient.setQueryData<WorkspaceNote[]>(
        inboxQueryKey,
        (current = []) => [note, ...current]
      );
      setTab('inbox');
      setSelectedId(note.id);
      setTitle('');
      setContent(emptyDoc);
      setLockedNote(null);
      passphraseRef.current = null;
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  };

  const setArchived = async (archived: boolean) => {
    if (!selectedId) return;
    if (!(await savePending())) return;
    try {
      await updateWorkspaceNote(wsId, selectedId, { archived });
      queryClient.setQueryData<WorkspaceNote[]>(queryKey, (current = []) =>
        current.filter((note) => note.id !== selectedId)
      );
      setSelectedId(null);
      setLockedNote(null);
      passphraseRef.current = null;
      await queryClient.invalidateQueries({
        queryKey: ['workspace', wsId, 'notes', archived ? 'archive' : 'inbox'],
      });
    } catch {
      setSaveError(true);
    }
  };

  const submitPassphrase = async (passphrase: string): Promise<boolean> => {
    if (lockDialog === 'open' && lockedNote) {
      try {
        const decoded = await decryptNote(lockedNote.content, passphrase);
        passphraseRef.current = passphrase;
        setContent(decoded);
        return true;
      } catch {
        return false;
      }
    }
    if (lockDialog === 'lock' && selectedId) {
      if (!(await savePending())) return false;
      try {
        const encrypted = await encryptNote(content, passphrase);
        const saved = await updateWorkspaceNote(wsId, selectedId, {
          content: encrypted as Record<string, unknown>,
        });
        updateList(saved);
        setLockedNote(saved);
        passphraseRef.current = null;
        setContent(emptyDoc);
        return true;
      } catch {
        setSaveError(true);
        return false;
      }
    }
    return false;
  };

  const recoverWithPasskey = async () => {
    if (!lockedNote || recovering) return;
    const selectedNote = lockedNote;
    const token = ++transferToken.current;
    setTransferQr(null);
    setRecovering(true);
    setRecoveryError(false);
    try {
      const secret = await recoverNoteKeyWithPasskey(wsId, selectedNote.id);
      if (token !== transferToken.current) return;
      const decoded = await decryptNote(selectedNote.content, secret);
      if (token !== transferToken.current) return;
      passphraseRef.current = secret;
      setContent(decoded);
    } catch {
      if (token === transferToken.current) setRecoveryError(true);
    } finally {
      if (token === transferToken.current) setRecovering(false);
    }
  };

  const unlockWithPhone = async () => {
    if (!lockedNote || transferQr) return;
    const selectedNote = lockedNote;
    const token = ++transferToken.current;
    setRecoveryError(false);
    try {
      const secret = await transferNoteKey({
        wsId,
        noteId: selectedNote.id,
        onQr: setTransferQr,
        isCancelled: () => token !== transferToken.current,
      });
      if (!secret || token !== transferToken.current) return;
      const decoded = await decryptNote(selectedNote.content, secret);
      passphraseRef.current = secret;
      setContent(decoded);
    } catch {
      if (token === transferToken.current) setRecoveryError(true);
    } finally {
      if (token === transferToken.current) setTransferQr(null);
    }
  };

  const removeLock = async () => {
    if (!selectedId || !lockedNote || !passphraseRef.current) return;
    if (!(await savePending())) return;
    try {
      const saved = await updateWorkspaceNote(wsId, selectedId, {
        content: content as Record<string, unknown>,
      });
      updateList(saved);
      setLockedNote(null);
      passphraseRef.current = null;
    } catch {
      setSaveError(true);
    }
  };

  const visible = notes.filter((note) =>
    `${note.title ?? ''} ${noteLockEnvelope(note.content) ? '' : excerpt(note.content)}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const convertChecklistItem = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const { $from } = editor.state.selection;
    let checklist = false;
    for (let depth = $from.depth; depth > 0; depth--) {
      if ($from.node(depth).type.name === 'taskItem') {
        checklist = true;
        break;
      }
    }
    const paragraph = $from.parent;
    const name = paragraph.textContent.trim();
    if (!checklist || paragraph.type.name !== 'paragraph' || !name) {
      setTaskSelectionError(true);
      return;
    }
    setTaskSelectionError(false);
    setTaskDraft({ name, from: $from.start(), to: $from.end() });
  };

  const openMention = async (event: MouseEvent<HTMLElement>) => {
    const element = (event.target as HTMLElement).closest<HTMLElement>(
      '[data-mention="true"]'
    );
    if (!element) return;
    const id = element.dataset.entityId;
    if (!id) return;
    const kind = element.dataset.entityType;
    if (kind === 'note') {
      const [inbox, archive] = await Promise.all([
        listWorkspaceNotes(wsId),
        listWorkspaceNotes(wsId, { archived: true }),
      ]);
      const note = [...inbox, ...archive].find((item) => item.id === id);
      if (!note) return;
      if (!(await savePending())) return;
      setTab(note.archived ? 'archive' : 'inbox');
      await selectNote(note);
      return;
    }
    const encodedId = encodeURIComponent(id);
    const route =
      kind === 'task'
        ? getTasksAppUrlClient(`/${locale}/${wsId}/tasks/${encodedId}`)
        : kind === 'event'
          ? `${getCalendarAppOrigin()}/${locale}/${wsId}?eventId=${encodedId}`
          : kind === 'finance'
            ? `${getFinanceAppOrigin()}/${locale}/${wsId}/wallets/${encodedId}`
            : kind === 'meeting'
              ? `${getMeetAppOrigin()}/${locale}/${wsId}/meetings/${encodedId}`
              : null;
    if (route) window.location.assign(route);
  };

  return (
    <div className="mx-auto flex min-h-[min(76vh,800px)] w-full max-w-6xl flex-col gap-5 px-4 pb-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-3 font-semibold text-2xl tracking-tight">
            <NotebookPen className="size-6 text-primary" />
            {t('title')}
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            {t('description')}
          </p>
        </div>
        <Button onClick={() => void createNote()}>
          <Plus className="mr-2 size-4" />
          {t('new')}
        </Button>
      </div>
      <div className="grid min-h-[65vh] overflow-hidden rounded-2xl border bg-card md:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
        <aside
          className={`border-b p-3 md:border-r md:border-b-0 ${selectedId ? 'hidden md:block' : ''}`}
        >
          <div className="relative mb-3">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t('search')}
              className="pl-9"
            />
          </div>
          <div
            className="mb-3 grid grid-cols-2 gap-1 rounded-xl bg-muted/60 p-1"
            role="tablist"
            aria-label={t('title')}
          >
            {(['inbox', 'archive'] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={tab === value}
                className={`rounded-lg px-3 py-2 font-medium text-sm transition-colors ${tab === value ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
                onClick={() => {
                  void savePending().then((saved) => {
                    if (!saved) return;
                    setSelectedId(null);
                    setLockedNote(null);
                    passphraseRef.current = null;
                    setTab(value);
                  });
                }}
              >
                {t(value === 'inbox' ? 'inbox' : 'archive_tab')}
              </button>
            ))}
          </div>
          {isLoading && (
            <p className="p-4 text-muted-foreground text-sm">{t('loading')}</p>
          )}
          {error && (
            <p className="p-4 text-destructive text-sm">{t('load_error')}</p>
          )}
          {!isLoading && !error && visible.length === 0 && (
            <p className="p-4 text-muted-foreground text-sm">
              {t(tab === 'archive' ? 'archived_empty' : 'empty')}
            </p>
          )}
          <div className="max-h-[65vh] space-y-1 overflow-y-auto">
            {visible.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => void selectNote(note)}
                className={`w-full rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted/70 ${selectedId === note.id ? 'bg-muted' : ''}`}
              >
                <span className="flex items-center gap-2 truncate font-medium">
                  {noteLockEnvelope(note.content) && (
                    <Lock className="size-3.5 shrink-0" />
                  )}
                  {note.title || t('untitled')}
                </span>
                <span className="mt-1 block truncate text-muted-foreground text-sm">
                  {noteLockEnvelope(note.content)
                    ? t('locked_preview')
                    : excerpt(note.content) || t('start_writing')}
                </span>
              </button>
            ))}
          </div>
        </aside>
        <section
          className={`min-w-0 p-4 sm:p-6 ${selectedId ? '' : 'hidden md:block'}`}
        >
          {selectedId ? (
            <div className="flex h-full flex-col gap-4">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  onClick={() =>
                    void savePending().then(
                      (saved) => saved && setSelectedId(null)
                    )
                  }
                  aria-label={t('back')}
                >
                  <ArrowLeft className="size-4" />
                </Button>
                <Input
                  value={title}
                  disabled={!!lockedNote && !passphraseRef.current}
                  onChange={(event) => {
                    const next = event.target.value;
                    setTitle(next);
                    scheduleSave({ id: selectedId, title: next, content });
                  }}
                  placeholder={t('untitled')}
                  className="h-12 border-0 px-0 font-semibold text-xl shadow-none focus-visible:ring-0"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() =>
                    lockedNote ? void removeLock() : setLockDialog('lock')
                  }
                  aria-label={t(lockedNote ? 'remove_lock' : 'lock')}
                  disabled={!!lockedNote && !passphraseRef.current}
                >
                  {lockedNote ? (
                    <LockOpen className="size-4" />
                  ) : (
                    <Lock className="size-4" />
                  )}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => void setArchived(tab === 'inbox')}
                  aria-label={t(tab === 'inbox' ? 'archive' : 'restore')}
                >
                  <Archive className="size-4" />
                </Button>
              </div>
              {(!lockedNote || passphraseRef.current) && (
                <NoteEntityPicker
                  wsId={wsId}
                  onSelect={({ id, kind, label }) => {
                    editorRef.current
                      ?.chain()
                      .focus()
                      .insertContent({
                        type: 'mention',
                        attrs: {
                          entityId: id,
                          entityType:
                            kind === 'tasks'
                              ? 'task'
                              : kind === 'events'
                                ? 'event'
                                : kind === 'notes'
                                  ? 'note'
                                  : kind === 'meetings'
                                    ? 'meeting'
                                    : 'finance',
                          displayName: label,
                          workspaceId: wsId,
                        },
                      })
                      .run();
                  }}
                />
              )}
              <div
                aria-live="polite"
                className="min-h-5 text-muted-foreground text-xs"
              >
                {taskSelectionError ? (
                  <span className="text-destructive">
                    {t('select_checklist_item')}
                  </span>
                ) : saveError ? (
                  <button
                    type="button"
                    className="text-destructive underline"
                    onClick={() => void savePending()}
                  >
                    {t('save_error')}
                  </button>
                ) : saving ? (
                  t('saving')
                ) : (
                  t('saved')
                )}
              </div>
              {!lockedNote || passphraseRef.current ? (
                <div
                  onClickCapture={(event) => void openMention(event)}
                  className="min-h-0 flex-1 [&_[data-mention]]:cursor-pointer"
                >
                  <RichTextEditor
                    key={selectedId}
                    editorRef={editorRef}
                    workspaceId={wsId}
                    content={content}
                    onImmediateChange={(next) => {
                      const doc = next ?? emptyDoc;
                      setContent(doc);
                      scheduleSave({ id: selectedId, title, content: doc });
                    }}
                    onConvertToTask={convertChecklistItem}
                    writePlaceholder={t('start_writing')}
                    className="min-h-96 flex-1 border-0"
                  />
                </div>
              ) : (
                <NoteLockPlaceholder
                  deviceLocked={isDeviceLockedNote(lockedNote.content)}
                  recovering={recovering}
                  transferQr={transferQr}
                  recoveryError={recoveryError}
                  labels={{
                    devicePreview: t('device_locked_preview'),
                    lockedPreview: t('locked_preview'),
                    passkey: t('recover_with_passkey'),
                    phone: t('unlock_with_phone'),
                    scanQr: t('scan_transfer_qr'),
                    cancelTransfer: t('cancel_transfer'),
                    recoveryError: t('recovery_error'),
                    openLocked: t('open_locked'),
                  }}
                  onPasskey={() => void recoverWithPasskey()}
                  onPhone={() => void unlockWithPhone()}
                  onCancelTransfer={() => {
                    transferToken.current++;
                    setTransferQr(null);
                  }}
                  onPassphrase={() => setLockDialog('open')}
                />
              )}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
              {t('select')}
            </div>
          )}
        </section>
      </div>
      <NotePassphraseDialog
        mode={lockDialog}
        onClose={() => setLockDialog(null)}
        onSubmit={submitPassphrase}
      />
      {taskDraft && (
        <NoteTaskConversionDialog
          wsId={wsId}
          name={taskDraft.name}
          open
          onOpenChange={(open) => {
            if (!open) setTaskDraft(null);
          }}
          onCreated={(id) => {
            editorRef.current
              ?.chain()
              .focus()
              .insertContentAt(
                { from: taskDraft.from, to: taskDraft.to },
                {
                  type: 'mention',
                  attrs: {
                    entityId: id,
                    entityType: 'task',
                    displayName: taskDraft.name,
                    workspaceId: wsId,
                  },
                }
              )
              .run();
            setTaskDraft(null);
          }}
        />
      )}
    </div>
  );
}
