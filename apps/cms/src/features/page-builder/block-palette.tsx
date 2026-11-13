'use client';

import { useDraggable } from '@dnd-kit/core';
import {
  type CmsBlockCategory,
  type CmsBlockType,
  cmsBlockRegistry,
  cmsBlockTypes,
} from '@tuturuuu/cms-blocks/schema';
import { GripVertical } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';

const CATEGORIES: CmsBlockCategory[] = ['content', 'events', 'layout'];

function PaletteItem({ type }: { type: CmsBlockType }) {
  const t = useTranslations('external-projects.page_builder');
  const { attributes, isDragging, listeners, setNodeRef } = useDraggable({
    data: { blockType: type, kind: 'palette' },
    id: `palette:${type}`,
  });
  return (
    <button
      className="flex w-full cursor-grab items-center gap-2 rounded-md border bg-background px-3 py-2 text-left text-sm transition hover:border-primary/60 hover:bg-muted data-[dragging=true]:opacity-50"
      data-dragging={isDragging}
      ref={setNodeRef}
      type="button"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="size-4 text-muted-foreground" />
      {t(`blocks.${type}`)}
    </button>
  );
}

export function BlockPalette() {
  const t = useTranslations('external-projects.page_builder');
  return (
    <div className="flex flex-col gap-4 p-3">
      {CATEGORIES.map((category) => (
        <section className="flex flex-col gap-1.5" key={category}>
          <h2 className="px-1 font-medium text-muted-foreground text-xs uppercase tracking-wide">
            {t(`categories.${category}`)}
          </h2>
          {cmsBlockTypes
            .filter((type) => cmsBlockRegistry[type].category === category)
            .map((type) => (
              <PaletteItem key={type} type={type} />
            ))}
        </section>
      ))}
    </div>
  );
}
