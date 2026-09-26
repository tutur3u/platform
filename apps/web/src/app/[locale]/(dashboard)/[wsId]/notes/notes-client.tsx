'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { JSONContent } from '@tiptap/react';
import { Archive, ArrowLeft, NotebookPen, Plus, Search } from '@tuturuuu/icons';
import {
  createWorkspaceNote,
  listWorkspaceNotes,
  updateWorkspaceNote,
  type WorkspaceNote,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import { Input } from '@tuturuuu/ui/input';
import { RichTextEditor } from '@tuturuuu/ui/text-editor/editor';
import { useTranslations } from 'next-intl';
import { useCallback, useMemo, useRef, useState } from 'react';

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
  const queryClient = useQueryClient();
  const queryKey = useMemo(() => ['workspace', wsId, 'notes'] as const, [wsId]);
  const {
    data: notes = [],
    isLoading,
    error,
  } = useQuery({
    queryKey,
    queryFn: () => listWorkspaceNotes(wsId),
  });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState<JSONContent>(emptyDoc);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
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
    const request = updateWorkspaceNote(wsId, draft.id, {
      title: draft.title,
      content: draft.content as Record<string, unknown>,
    });
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
  }, [updateList, wsId]);

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
    setContent((note.content as JSONContent) ?? emptyDoc);
  };

  const createNote = async () => {
    if (!(await savePending())) return;
    try {
      const note = await createWorkspaceNote(wsId, {
        title: '',
        content: emptyDoc,
      });
      queryClient.setQueryData<WorkspaceNote[]>(queryKey, (current = []) => [
        note,
        ...current,
      ]);
      setSelectedId(note.id);
      setTitle('');
      setContent(emptyDoc);
      setSaveError(false);
    } catch {
      setSaveError(true);
    }
  };

  const archiveNote = async () => {
    if (!selectedId) return;
    if (!(await savePending())) return;
    try {
      await updateWorkspaceNote(wsId, selectedId, { archived: true });
      queryClient.setQueryData<WorkspaceNote[]>(queryKey, (current = []) =>
        current.filter((note) => note.id !== selectedId)
      );
      setSelectedId(null);
    } catch {
      setSaveError(true);
    }
  };

  const visible = notes.filter((note) =>
    `${note.title ?? ''} ${excerpt(note.content)}`
      .toLowerCase()
      .includes(search.toLowerCase())
  );

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
          {isLoading && (
            <p className="p-4 text-muted-foreground text-sm">{t('loading')}</p>
          )}
          {error && (
            <p className="p-4 text-destructive text-sm">{t('load_error')}</p>
          )}
          {!isLoading && !error && visible.length === 0 && (
            <p className="p-4 text-muted-foreground text-sm">{t('empty')}</p>
          )}
          <div className="max-h-[65vh] space-y-1 overflow-y-auto">
            {visible.map((note) => (
              <button
                key={note.id}
                type="button"
                onClick={() => void selectNote(note)}
                className={`w-full rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted/70 ${selectedId === note.id ? 'bg-muted' : ''}`}
              >
                <span className="block truncate font-medium">
                  {note.title || t('untitled')}
                </span>
                <span className="mt-1 block truncate text-muted-foreground text-sm">
                  {excerpt(note.content) || t('start_writing')}
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
                  onClick={() => void archiveNote()}
                  aria-label={t('archive')}
                >
                  <Archive className="size-4" />
                </Button>
              </div>
              <div
                aria-live="polite"
                className="min-h-5 text-muted-foreground text-xs"
              >
                {saveError ? (
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
              <RichTextEditor
                key={selectedId}
                workspaceId={wsId}
                content={content}
                onImmediateChange={(next) => {
                  const doc = next ?? emptyDoc;
                  setContent(doc);
                  scheduleSave({ id: selectedId, title, content: doc });
                }}
                writePlaceholder={t('start_writing')}
                className="min-h-96 flex-1 border-0"
              />
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground text-sm">
              {t('select')}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
