'use client';

import { useDroppable } from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { renderCmsBlock, TwoColumnLayout } from '@tuturuuu/cms-blocks/render';
import type { CmsBlock } from '@tuturuuu/cms-blocks/schema';
import { Copy, GripVertical, Trash2 } from '@tuturuuu/icons';
import { Button } from '@tuturuuu/ui/button';
import { cn } from '@tuturuuu/utils/format';
import { useTranslations } from 'next-intl';
import type { Dispatch } from 'react';
import type { EditorAction, ZoneId } from './editor-state';

interface CanvasProps {
  dispatch: Dispatch<EditorAction>;
  newId: () => string;
  selectedId: string | null;
}

export function BlockZone({
  blocks,
  zone,
  ...props
}: CanvasProps & { blocks: CmsBlock[]; zone: ZoneId }) {
  const t = useTranslations('external-projects.page_builder');
  const { isOver, setNodeRef } = useDroppable({
    data: { kind: 'zone', zone },
    id: `zone:${zone}`,
  });
  return (
    <SortableContext
      id={zone}
      items={blocks.map((block) => block.props.id)}
      strategy={verticalListSortingStrategy}
    >
      <div
        className={cn(
          'flex min-h-16 flex-col gap-1 rounded-md',
          blocks.length === 0 &&
            'items-center justify-center border border-dashed text-muted-foreground text-sm',
          isOver && 'bg-primary/5 ring-1 ring-primary/40'
        )}
        ref={setNodeRef}
      >
        {blocks.length === 0 ? t('drop_here') : null}
        {blocks.map((block) => (
          <SortableBlock
            block={block}
            key={block.props.id}
            zone={zone}
            {...props}
          />
        ))}
      </div>
    </SortableContext>
  );
}

function SortableBlock({
  block,
  dispatch,
  newId,
  selectedId,
  zone,
}: CanvasProps & { block: CmsBlock; zone: ZoneId }) {
  const t = useTranslations('external-projects.page_builder');
  const id = block.props.id;
  const selected = selectedId === id;
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({
    data: { kind: 'block', zone },
    id,
  });
  const preview =
    block.type === 'TwoColumn' ? (
      <TwoColumnLayout
        left={
          <BlockZone
            blocks={block.props.left}
            dispatch={dispatch}
            newId={newId}
            selectedId={selectedId}
            zone={`${id}:left`}
          />
        }
        ratio={block.props.ratio}
        right={
          <BlockZone
            blocks={block.props.right}
            dispatch={dispatch}
            newId={newId}
            selectedId={selectedId}
            zone={`${id}:right`}
          />
        }
      />
    ) : (
      <div className="pointer-events-none">{renderCmsBlock(block)}</div>
    );

  return (
    <div
      className={cn(
        'group relative rounded-md p-2 outline outline-1 outline-transparent transition-[outline-color]',
        'hover:outline-border',
        selected && 'outline-2 outline-primary hover:outline-primary',
        isDragging && 'opacity-40'
      )}
      onClick={(event) => {
        event.stopPropagation();
        dispatch({ id, type: 'select' });
      }}
      onFocus={(event) => {
        // Keyboard users select a block by tabbing into its toolbar.
        event.stopPropagation();
        if (!selected) dispatch({ id, type: 'select' });
      }}
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
    >
      <div
        className={cn(
          'absolute -top-3 right-2 z-10 flex items-center gap-0.5 rounded-md border bg-background p-0.5 opacity-0 shadow-sm',
          'group-focus-within:opacity-100 group-hover:opacity-100',
          selected && 'opacity-100'
        )}
      >
        <Button
          aria-label={t(`blocks.${block.type}`)}
          className="size-7 cursor-grab"
          size="icon"
          variant="ghost"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </Button>
        <Button
          aria-label={t('duplicate')}
          className="size-7"
          onClick={() => dispatch({ id, newId: newId(), type: 'duplicate' })}
          size="icon"
          variant="ghost"
        >
          <Copy className="size-4" />
        </Button>
        <Button
          aria-label={t('delete')}
          className="size-7"
          onClick={() => dispatch({ id, type: 'remove' })}
          size="icon"
          variant="ghost"
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
      {preview}
    </div>
  );
}
