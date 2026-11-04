'use client';

import {
  type CollisionDetection,
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import type { CmsBlockType, CmsPage } from '@tuturuuu/cms-blocks/schema';
import { Redo2, Undo2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { useTranslations } from 'next-intl';
import { useReducer } from 'react';
import { BlockInspector } from './block-inspector';
import { BlockPalette } from './block-palette';
import { BlockZone } from './builder-canvas';
import {
  createEditorState,
  editorReducer,
  findBlock,
  type ZoneId,
} from './editor-state';

interface Props {
  entryTitle: string;
  initialPage: CmsPage;
}

/** Prefer the innermost zone or block under the pointer so nested columns accept drops. */
const collisionDetection: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length > 0 ? hits : closestCenter(args);
};

const newId = () => crypto.randomUUID();

export function PageBuilderClient(props: Props) {
  const t = useTranslations('external-projects.page_builder');
  const [state, dispatch] = useReducer(
    editorReducer,
    props.initialPage,
    createEditorState
  );
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over) return;
    const overData = over.data.current as
      | { kind: 'block' | 'zone'; zone: ZoneId }
      | undefined;
    if (!overData) return;
    const zone = overData.zone;
    const target =
      overData.kind === 'block' ? findBlock(state.page, String(over.id)) : null;
    // Dropping on a zone (not a block) appends; insertion clamps to the zone length.
    let index = target?.index ?? Number.MAX_SAFE_INTEGER;

    const activeData = active.data.current as
      | { blockType?: CmsBlockType; kind: string }
      | undefined;
    if (activeData?.kind === 'palette' && activeData.blockType) {
      dispatch({
        blockType: activeData.blockType,
        id: newId(),
        index,
        type: 'insert',
        zone,
      });
      return;
    }
    const source = findBlock(state.page, String(active.id));
    if (!source || active.id === over.id) return;
    // Sortable semantics: dropping on a later sibling places the block after it.
    if (target && source.zone === zone && source.index < target.index)
      index += 1;
    dispatch({ id: String(active.id), index, type: 'move', zone });
  }

  const selected = state.selectedId
    ? (findBlock(state.page, state.selectedId)?.block ?? null)
    : null;

  return (
    <DndContext
      collisionDetection={collisionDetection}
      onDragEnd={onDragEnd}
      sensors={sensors}
    >
      <div className="flex h-[calc(100svh-4rem)] min-h-0 flex-col overflow-hidden rounded-lg border bg-background">
        <header className="flex items-center gap-2 border-b px-4 py-2">
          <h1 className="min-w-0 flex-1 truncate font-semibold">
            {props.entryTitle}
          </h1>
          <Button
            aria-label={t('undo')}
            disabled={state.past.length === 0}
            onClick={() => dispatch({ type: 'undo' })}
            size="icon"
            variant="ghost"
          >
            <Undo2 className="size-4" />
          </Button>
          <Button
            aria-label={t('redo')}
            disabled={state.future.length === 0}
            onClick={() => dispatch({ type: 'redo' })}
            size="icon"
            variant="ghost"
          >
            <Redo2 className="size-4" />
          </Button>
        </header>
        <div className="grid min-h-0 flex-1 grid-cols-[14rem_minmax(0,1fr)_18rem]">
          <aside className="min-h-0 overflow-y-auto border-r bg-muted/30">
            <BlockPalette />
          </aside>
          <main
            className="min-h-0 overflow-y-auto bg-muted/20 p-6"
            onClick={() => dispatch({ id: null, type: 'select' })}
          >
            <div className="mx-auto max-w-4xl rounded-lg border bg-background p-4 shadow-sm [&_img]:h-auto [&_img]:max-w-full">
              <BlockZone
                blocks={state.page.content}
                dispatch={dispatch}
                newId={newId}
                selectedId={state.selectedId}
                zone="root"
              />
            </div>
          </main>
          <aside className="min-h-0 overflow-y-auto border-l">
            <BlockInspector block={selected} dispatch={dispatch} />
          </aside>
        </div>
      </div>
    </DndContext>
  );
}
