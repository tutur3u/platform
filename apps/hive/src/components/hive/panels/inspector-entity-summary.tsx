'use client';

import { Bot, Box } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { getObjectCatalogItem, getTerrainHeight } from '@/engine/catalog';
import { getObjectFootprintLabel } from '@/engine/footprint';
import type {
  HiveBlock,
  HiveNpc,
  HiveObject,
  HiveSelection,
} from '@/engine/types';

type InspectorEntitySummaryProps = {
  entity: HiveBlock | HiveNpc | HiveObject;
  selection: NonNullable<HiveSelection>;
  tileObjects: HiveObject[];
};

export function InspectorEntitySummary({
  entity,
  selection,
  tileObjects,
}: InspectorEntitySummaryProps) {
  const t = useTranslations('studio.inspector');
  const selectedObject =
    selection.kind === 'object' ? (entity as HiveObject) : null;
  const objectCatalogItem = selectedObject
    ? getObjectCatalogItem(selectedObject.type)
    : null;

  return (
    <section className="rounded-lg border border-border/20 bg-white/5 p-4">
      <div className="flex items-center gap-2 text-sm text-zinc-200">
        {selection.kind === 'npc' ? (
          <Bot className="h-4 w-4 text-dynamic-green" />
        ) : (
          <Box className="h-4 w-4 text-dynamic-green" />
        )}
        <span className="font-medium">{t(selection.kind)}</span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-xs">
        <SummaryItem label={t('id')} value={entity.id} wide />
        {'type' in entity ? (
          <SummaryItem label={t('type')} value={entity.type} />
        ) : null}
        {selection.kind === 'block' && 'type' in entity ? (
          <>
            <SummaryItem
              label={t('surface_height')}
              value={getTerrainHeight(entity.type).toFixed(2)}
            />
            <SummaryItem
              label={t('tile_objects')}
              value={
                tileObjects.length
                  ? tileObjects.map((object) => object.type).join(', ')
                  : t('empty_tile')
              }
            />
          </>
        ) : null}
        {selectedObject && objectCatalogItem ? (
          <>
            <SummaryItem
              label={t('category')}
              value={objectCatalogItem.category}
            />
            <SummaryItem
              label={t('footprint')}
              value={getObjectFootprintLabel(selectedObject.type)}
            />
            <SummaryItem
              label={t('placement_rule')}
              value={objectCatalogItem.description ?? t('single_object_tile')}
              wide
            />
          </>
        ) : null}
        {selection.kind === 'npc' && 'model' in entity ? (
          <>
            <SummaryItem label={t('name')} value={entity.name} />
            <SummaryItem label={t('model')} value={entity.model} />
          </>
        ) : null}
      </dl>
    </section>
  );
}

function SummaryItem({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <dt className="text-zinc-500">{label}</dt>
      <dd className="break-words text-zinc-300">{value}</dd>
    </div>
  );
}
