'use client';

import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, GripVertical, Menu } from '@tuturuuu/icons';
import {
  listAllWorkspaceDocuments,
  updateWorkspaceDocument,
} from '@tuturuuu/internal-api';
import { Button } from '@tuturuuu/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@tuturuuu/ui/sheet';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useRef, useState, type ReactNode } from 'react';
import {
  ancestors,
  documentHierarchyQueryKey,
  keyboardMove,
  preflightMove,
  siblings,
  visibleDocuments,
  type DocumentMove,
  type MoveResult,
  type KeyboardMove,
} from '@/lib/documents/hierarchy';
import { persistDocumentMove } from '@/lib/documents/persist-move';
import { CreateChild } from './create-child';

type MoveState =
  | { kind: 'idle' }
  | { kind: 'pending' }
  | {
      kind: 'error';
      attempt: { id: string; previous: DocumentMove; move: DocumentMove };
    }
  | {
      kind: 'denied';
      reason: Extract<MoveResult, { kind: 'denied' }>['reason'];
    }
  | { kind: 'success'; id: string; previous: DocumentMove };

export function DocumentHierarchy({
  wsId,
  canManage,
  children,
}: {
  wsId: string;
  canManage: boolean;
  children: ReactNode;
}) {
  const t = useTranslations('document-hierarchy');
  const params = useParams<{ documentId?: string }>();
  const selectedId = params.documentId;
  const query = useQuery({
    queryKey: documentHierarchyQueryKey(wsId),
    queryFn: () => listAllWorkspaceDocuments(wsId),
    retry: false,
  });
  const documents = query.data?.data ?? [];
  const [expanded, setExpanded] = useState<Map<string, boolean>>(new Map());
  const [mobileOpen, setMobileOpen] = useState(false);
  const [moveState, setMoveState] = useState<MoveState>({ kind: 'idle' });
  const moving = useRef(false);
  const dragged = useRef<string | null>(null);
  const parents = selectedId ? ancestors(documents, selectedId) : [];
  const openIds = new Set([
    ...parents.map((doc) => doc.id).filter((id) => expanded.get(id) !== false),
    ...[...expanded].filter(([, open]) => open).map(([id]) => id),
  ]);
  const rows = visibleDocuments(documents, openIds);
  const selected = documents.find((doc) => doc.id === selectedId);
  const refresh = () => {
    void query.refetch().then((result) => {
      if (!result.isError) {
        const attempt = moveState.kind === 'error' ? moveState.attempt : null;
        const saved =
          attempt && result.data?.data.find((doc) => doc.id === attempt.id);
        setMoveState(
          attempt &&
            saved &&
            saved.parent_id === attempt.move.parent_id &&
            saved.position === attempt.move.position
            ? { kind: 'success', id: attempt.id, previous: attempt.previous }
            : { kind: 'idle' }
        );
      }
    });
  };
  async function move(id: string, result: MoveResult) {
    if (
      !canManage ||
      moving.current ||
      query.isFetching ||
      query.isError ||
      !query.data
    )
      return;
    if (result.kind === 'denied') {
      setMoveState(result);
      return;
    }
    const document = documents.find((doc) => doc.id === id);
    if (!document) return;
    const attempt = {
      id,
      move: result.move,
      previous: {
        parent_id: document.parent_id ?? null,
        position: result.previousPosition ?? document.position ?? null,
      },
    };
    moving.current = true;
    setMoveState({ kind: 'pending' });
    try {
      const outcome = await persistDocumentMove({
        id,
        result,
        canManage,
        update: (documentId, payload) =>
          updateWorkspaceDocument(wsId, documentId, payload),
      });
      if (outcome !== 'saved') {
        const refreshed = await query.refetch();
        const saved = refreshed.data?.data.find((doc) => doc.id === id);
        setMoveState(
          !refreshed.isError &&
            saved?.parent_id === attempt.move.parent_id &&
            saved?.position === attempt.move.position
            ? { kind: 'success', id, previous: attempt.previous }
            : { kind: 'error', attempt }
        );
        return;
      }
      const refreshed = await query.refetch();
      if (refreshed.isError) {
        setMoveState({ kind: 'error', attempt });
        return;
      }
      setMoveState({
        kind: 'success',
        id,
        previous: {
          parent_id: document.parent_id ?? null,
          position: result.previousPosition ?? document.position ?? null,
        },
      });
      if (result.move.parent_id)
        setExpanded((previous) =>
          new Map(previous).set(result.move.parent_id ?? '', true)
        );
    } catch {
      setMoveState({ kind: 'error', attempt });
      await query.refetch();
    } finally {
      moving.current = false;
    }
  }
  const disabled =
    moveState.kind === 'pending' ||
    moveState.kind === 'error' ||
    query.isFetching ||
    query.isError;
  const navigation = (
    <nav aria-label={t('pages')} className="flex min-h-0 flex-col gap-3">
      {canManage && (
        <CreateChild wsId={wsId} parentId={null} onCreated={refresh} />
      )}
      {query.isPending ? (
        <p role="status">{t('loading')}</p>
      ) : query.isError ? (
        <div role="alert">
          <p>{t('load-error')}</p>
          <Button onClick={refresh}>{t('refresh')}</Button>
        </div>
      ) : (
        <>
          {!rows.length && (
            <p className="text-muted-foreground text-sm">{t('empty')}</p>
          )}
          <ul className="min-h-0 overflow-auto">
            {rows.map(({ document, depth }) => (
              <li key={document.id}>
                <div
                  className={`flex items-center gap-1 rounded-md py-1 ${selectedId === document.id ? 'bg-accent' : ''}`}
                  style={{ paddingInlineStart: `${(depth - 1) * 16}px` }}
                  onDragOver={(event) => {
                    if (canManage && !disabled) event.preventDefault();
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    const id = dragged.current;
                    dragged.current = null;
                    if (!id || !canManage || disabled) return;
                    const before =
                      event.clientY <
                      event.currentTarget.getBoundingClientRect().top +
                        event.currentTarget.getBoundingClientRect().height / 3;
                    void move(
                      id,
                      preflightMove({
                        documents,
                        id,
                        parentId: before
                          ? (document.parent_id ?? null)
                          : document.id,
                        beforeId: before ? document.id : null,
                        canManage,
                      })
                    );
                  }}
                >
                  {siblings(documents, document.id).length ? (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 shrink-0"
                      aria-label={
                        openIds.has(document.id)
                          ? t('collapse', {
                              name: document.name ?? t('untitled'),
                            })
                          : t('expand', {
                              name: document.name ?? t('untitled'),
                            })
                      }
                      aria-expanded={openIds.has(document.id)}
                      onClick={() =>
                        setExpanded((previous) => {
                          return new Map(previous).set(
                            document.id,
                            !openIds.has(document.id)
                          );
                        })
                      }
                    >
                      {openIds.has(document.id) ? (
                        <ChevronDown className="size-4" />
                      ) : (
                        <ChevronRight className="size-4" />
                      )}
                    </Button>
                  ) : (
                    <span className="w-8 shrink-0" />
                  )}
                  <Link
                    className="min-w-0 flex-1 truncate rounded-sm px-1 py-2 text-sm focus-visible:outline-2"
                    href={`/${wsId}/documents/${document.id}`}
                    aria-current={
                      selectedId === document.id ? 'page' : undefined
                    }
                    onClick={() => setMobileOpen(false)}
                  >
                    {document.name || t('untitled')}
                  </Link>
                  {canManage && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      disabled={disabled}
                      draggable={!disabled}
                      aria-label={t('move-document', {
                        name: document.name ?? t('untitled'),
                      })}
                      title={t('drag-help')}
                      onDragStart={(event) => {
                        dragged.current = document.id;
                        event.dataTransfer.effectAllowed = 'move';
                        event.dataTransfer.setData('text/plain', document.id);
                      }}
                      onDragEnd={() => {
                        dragged.current = null;
                      }}
                      onKeyDown={(event) => {
                        if (!event.altKey) return;
                        const direction: KeyboardMove | null =
                          event.key === 'ArrowUp'
                            ? 'up'
                            : event.key === 'ArrowDown'
                              ? 'down'
                              : event.key === 'ArrowRight'
                                ? 'indent'
                                : event.key === 'ArrowLeft'
                                  ? 'outdent'
                                  : null;
                        if (direction) {
                          event.preventDefault();
                          void move(
                            document.id,
                            keyboardMove({
                              documents,
                              id: document.id,
                              direction,
                              canManage,
                            })
                          );
                        }
                      }}
                    >
                      <GripVertical className="size-4" />
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </nav>
  );
  return (
    <div className="flex min-w-0 gap-6">
      <aside className="hidden w-64 shrink-0 border-r pr-4 md:block">
        {navigation}
      </aside>
      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex items-center gap-2">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                className="md:hidden"
                aria-label={t('pages')}
              >
                <Menu className="size-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-4">
              <SheetHeader>
                <SheetTitle>{t('pages')}</SheetTitle>
              </SheetHeader>
              {navigation}
            </SheetContent>
          </Sheet>
          <nav aria-label={t('breadcrumbs')} className="min-w-0">
            <ol className="flex flex-wrap items-center gap-2 text-sm">
              <li>
                <Link href={`/${wsId}/documents`}>{t('pages')}</Link>
              </li>
              {[...parents, ...(selected ? [selected] : [])].map((doc) => (
                <li key={doc.id} className="flex min-w-0 items-center gap-2">
                  <ChevronRight className="size-3 shrink-0" />
                  <Link
                    className="break-all"
                    href={`/${wsId}/documents/${doc.id}`}
                    aria-current={doc.id === selectedId ? 'page' : undefined}
                  >
                    {doc.name || t('untitled')}
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
        </div>
        {canManage && selected && (
          <div
            className="flex flex-wrap gap-2"
            role="group"
            aria-label={t('move-controls')}
          >
            <CreateChild
              wsId={wsId}
              parentId={selected.id}
              onCreated={refresh}
            />
            {(['up', 'down', 'indent', 'outdent'] as const).map((direction) => (
              <Button
                key={direction}
                variant="outline"
                size="sm"
                disabled={
                  disabled ||
                  keyboardMove({
                    documents,
                    id: selected.id,
                    direction,
                    canManage,
                  }).kind === 'denied'
                }
                onClick={() =>
                  void move(
                    selected.id,
                    keyboardMove({
                      documents,
                      id: selected.id,
                      direction,
                      canManage,
                    })
                  )
                }
              >
                {t(direction)}
              </Button>
            ))}
            <label className="flex items-center gap-2 text-sm">
              {t('move-to')}
              <select
                className="max-w-48 rounded-md border bg-background p-2"
                value=""
                disabled={disabled}
                onChange={(event) => {
                  if (event.target.value)
                    void move(
                      selected.id,
                      preflightMove({
                        documents,
                        id: selected.id,
                        parentId:
                          event.target.value === 'root'
                            ? null
                            : event.target.value,
                        canManage,
                      })
                    );
                }}
              >
                <option value="" disabled>
                  {t('choose-parent')}
                </option>
                <option value="root">{t('root')}</option>
                {documents
                  .filter(
                    (doc) =>
                      preflightMove({
                        documents,
                        id: selected.id,
                        parentId: doc.id,
                        canManage,
                      }).kind === 'allowed'
                  )
                  .map((doc) => (
                    <option key={doc.id} value={doc.id}>
                      {doc.name || t('untitled')}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        )}
        {moveState.kind === 'pending' && <p role="status">{t('moving')}</p>}
        {moveState.kind === 'error' && (
          <div role="alert" className="space-y-2">
            <p>{t('move-error')}</p>
            <Button variant="outline" onClick={refresh}>
              {t('refresh')}
            </Button>
          </div>
        )}
        {moveState.kind === 'denied' && (
          <p role="alert">{t(`denied-${moveState.reason}`)}</p>
        )}
        {moveState.kind === 'success' && (
          <div role="status" className="flex items-center gap-2">
            <span>{t('moved')}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={disabled || !canManage}
              onClick={() => {
                const check = preflightMove({
                  documents,
                  id: moveState.id,
                  parentId: moveState.previous.parent_id,
                  restorePosition: moveState.previous.position,
                  canManage,
                });
                void move(
                  moveState.id,
                  check.kind === 'allowed'
                    ? { kind: 'allowed', move: moveState.previous }
                    : check
                );
              }}
            >
              {t('undo')}
            </Button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
