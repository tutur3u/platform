'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { type Editor, useEditorState } from '@tiptap/react';
import { Quote } from '@tuturuuu/icons';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { registerCitationClipboardScope } from '../citation-clipboard-scope';
import { ToolbarButton } from '../toolbar-controls';
import {
  insertCitation,
  setCitationStyle,
  updateCitation,
} from './citation-commands';
import {
  CitationContext,
  type CitationContextValue,
  type CitationDrawerTarget,
  type CitationFormatState,
  type CitationLibraryState,
  type CitationRepairSession,
  useCitationContext,
} from './citation-context';
import { CitationDrawer } from './citation-drawer';
import type { CitationChoice } from './citation-source-card';
import { type CitationLabels, DEFAULT_CITATION_LABELS } from './labels';
import { collectDocumentCitations } from './snapshot';
import type { CitationAdapter, CitationSnapshot } from './types';

/** A drawer target plus the session that may still apply a choice to it. */
type ActiveTarget = CitationDrawerTarget & { session: number };

/**
 * Synchronous fence for drawer sessions: only the session that is still open
 * may change the document. Closing, applying a choice or reopening retires the
 * previous session before React re-renders, so a late library save can never
 * insert or replace through an old target.
 */
export function createDrawerSessionFence() {
  let counter = 0;
  let active = 0;
  return {
    open() {
      counter += 1;
      active = counter;
      return counter;
    },
    close() {
      active = 0;
    },
    isActive(session: number) {
      return session !== 0 && active === session;
    },
  };
}

/** Opt-in citation support for {@link RichTextEditor}. */
export interface CitationEditorConfig {
  adapter: CitationAdapter;
  labels?: Partial<CitationLabels>;
}

interface Props {
  editor: Editor | null;
  config: CitationEditorConfig;
  readOnly: boolean;
  children: ReactNode;
}

export function CitationLayer({ editor, config, readOnly, children }: Props) {
  const { adapter } = config;
  const queryClient = useQueryClient();
  const labels = useMemo(
    () => ({ ...DEFAULT_CITATION_LABELS, ...config.labels }),
    [config.labels]
  );
  const [target, setTarget] = useState<ActiveTarget | null>(null);
  const [fence] = useState(createDrawerSessionFence);
  const openDrawer = useCallback(
    (next: CitationDrawerTarget) =>
      setTarget({ ...next, session: fence.open() }),
    [fence]
  );
  const closeDrawer = useCallback(() => {
    fence.close();
    setTarget(null);
  }, [fence]);
  const [repairSessions] = useState(
    () => new Map<string, CitationRepairSession>()
  );
  const [rawRepairInput] = useState<{ current: string | null }>(() => ({
    current: null,
  }));

  const collected = useEditorState({
    editor,
    selector: ({ editor: current }) =>
      current ? collectDocumentCitations(current.state.doc) : null,
  });
  const style = collected?.style ?? 'apa';
  const citations = collected?.citations;

  const format = useMemo<CitationFormatState>(() => {
    try {
      return {
        status: 'ok',
        result: adapter.formatDocument(style, citations ?? []),
      };
    } catch {
      console.error('cite_formatting_failed');
      return { status: 'error' };
    }
  }, [adapter, style, citations]);

  const itemIds = useMemo(
    () =>
      [
        ...new Set(
          (citations ?? []).flatMap((citation) =>
            citation.itemId ? [citation.itemId] : []
          )
        ),
      ].sort(),
    [citations]
  );
  const libraryItemsKey = [
    ...(adapter.library?.queryKey ?? ['citation-library']),
    'items',
    itemIds,
  ];
  const libraryItems = useQuery({
    queryKey: libraryItemsKey,
    queryFn: () => {
      if (!adapter.library) throw new Error('Citation library adapter missing');
      return adapter.library.getMany(itemIds);
    },
    enabled: Boolean(adapter.library) && itemIds.length > 0,
    staleTime: 60_000,
    retry: false,
  });
  const hasLibrary = Boolean(adapter.library);
  const library = useMemo<CitationLibraryState>(
    () =>
      !hasLibrary
        ? { status: 'none' }
        : libraryItems.isError
          ? { status: 'failed' }
          : libraryItems.data
            ? { status: 'settled', result: libraryItems.data }
            : { status: 'pending' },
    [hasLibrary, libraryItems.isError, libraryItems.data]
  );

  const inspect = useCallback(
    (snapshot: CitationSnapshot) => adapter.inspectSnapshot(snapshot, style),
    [adapter, style]
  );

  // Copy and Markdown export format from the document as it is at copy time;
  // this registers an editor callback, not data fetching.
  useEffect(() => {
    if (!editor) return;
    return registerCitationClipboardScope(editor, () => {
      const current = collectDocumentCitations(editor.state.doc);
      return adapter.formatDocument(current.style, current.citations);
    });
  }, [editor, adapter]);

  // Registers the `/cite` and keyboard triggers; this is an editor
  // subscription, not data fetching.
  useEffect(() => {
    const storage = editor?.storage.citationKit;
    if (!editor || !storage || readOnly) return;
    storage.requestInsert = () =>
      openDrawer({ mode: 'insert', pos: editor.state.selection.to });
    return () => {
      storage.requestInsert = null;
    };
  }, [editor, readOnly, openDrawer]);

  /** Applies a choice only while `session` is still the open drawer session. */
  const choose = useCallback(
    (session: ActiveTarget, choice: CitationChoice) => {
      // A saved source still refreshes the library even when it lands late.
      if (choice.itemId && adapter.library) {
        void queryClient.invalidateQueries({
          queryKey: adapter.library.queryKey,
        });
      }
      if (!editor || !fence.isActive(session.session)) return false;
      const snapshot = adapter.createSnapshot(
        choice.work,
        choice.libraryVersion
      );
      if (!snapshot) return false;
      fence.close();
      if (session.mode === 'insert') {
        insertCitation(
          editor,
          { pos: session.pos, itemId: choice.itemId, snapshot },
          style
        );
      } else {
        updateCitation(editor, session.citationId, {
          itemId: choice.itemId,
          snapshot,
        });
      }
      setTarget(null);
      return true;
    },
    [adapter, editor, fence, queryClient, style]
  );

  // Bound to the session rendered now; the capture tab keeps this exact
  // function for an in-flight save, so the fence above sees the old session.
  const chooseForTarget = useMemo(
    () =>
      target
        ? (choice: CitationChoice) => {
            choose(target, choice);
          }
        : () => undefined,
    [choose, target]
  );

  const value = useMemo<CitationContextValue | null>(
    () =>
      editor
        ? {
            editor,
            adapter,
            labels,
            style,
            format,
            inspect,
            library,
            openDrawer,
            setStyle: (next) => setCitationStyle(editor, next),
            repairSessions,
            rawRepairInput,
          }
        : null,
    [
      editor,
      adapter,
      labels,
      style,
      format,
      inspect,
      library,
      openDrawer,
      repairSessions,
      rawRepairInput,
    ]
  );

  return (
    <CitationContext.Provider value={value}>
      {children}
      {value && !readOnly && (
        <CitationDrawer
          open={target !== null}
          onOpenChange={(open) => {
            if (!open) closeDrawer();
          }}
          adapter={adapter}
          labels={labels}
          onChoose={chooseForTarget}
        />
      )}
    </CitationContext.Provider>
  );
}

/** Toolbar trigger; renders nothing outside an opted-in editable editor. */
export function CitationToolbarButton() {
  const context = useCitationContext();
  if (!context) return null;
  const { editor, labels, openDrawer } = context;
  return (
    <ToolbarButton
      id="citation"
      label={labels.insert}
      icon={<Quote className="size-4" />}
      pressed={false}
      onClick={() =>
        openDrawer({ mode: 'insert', pos: editor.state.selection.to })
      }
    />
  );
}
