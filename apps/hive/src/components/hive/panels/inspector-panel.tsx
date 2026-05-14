'use client';

import { Trash2 } from '@tuturuuu/icons';
import { useTranslations } from 'next-intl';
import { getObjectFootprintCells } from '@/engine/footprint';
import type {
  HiveBlock,
  HiveNpc,
  HiveObject,
  HiveSelection,
  HiveWorldData,
} from '@/engine/types';
import { findSelectedEntity } from '@/engine/world';
import { InspectorEntitySummary } from './inspector-entity-summary';
import { InspectorHeader } from './inspector-header';
import { NpcPromptFields } from './inspector-npc-prompt-fields';
import { InspectorStyleFields } from './inspector-style-fields';
import { InspectorTransformFields } from './inspector-transform-fields';

type InspectorPanelProps = {
  npcs: HiveNpc[];
  onPatchBlock: (
    id: string,
    patch: Partial<Pick<HiveBlock, 'position' | 'state' | 'type'>>
  ) => void;
  onPatchNpc: (id: string, patch: Partial<HiveNpc>) => void;
  onPatchObject: (
    id: string,
    patch: Partial<Pick<HiveObject, 'position' | 'rotation' | 'state'>>
  ) => void;
  onRequestDelete: (selection: NonNullable<HiveSelection>) => void;
  onToggle: () => void;
  selection: HiveSelection;
  world: HiveWorldData;
};

export function InspectorPanel({
  npcs,
  onPatchBlock,
  onPatchNpc,
  onPatchObject,
  onRequestDelete,
  onToggle,
  selection,
  world,
}: InspectorPanelProps) {
  const t = useTranslations('studio.inspector');
  const entity = findSelectedEntity(world, npcs, selection);
  const tileObjects =
    selection?.kind === 'block' && entity
      ? world.objects.filter((object) =>
          getObjectFootprintCells(object).some(
            (cell) =>
              cell.x === entity.position.x && cell.z === entity.position.z
          )
        )
      : [];

  return (
    <aside className="flex h-full w-full shrink-0 flex-col bg-[#101114] text-zinc-100">
      <InspectorHeader onToggle={onToggle} />
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
        {!entity || !selection ? (
          <div className="rounded-lg border border-border/20 bg-white/5 p-4 text-sm text-zinc-400 leading-6">
            {t('empty')}
          </div>
        ) : (
          <>
            <InspectorEntitySummary
              entity={entity}
              selection={selection}
              tileObjects={tileObjects}
            />
            {selection.kind === 'block' ? (
              <>
                <InspectorTransformFields
                  entity={entity as HiveBlock}
                  kind="block"
                  onPatch={onPatchBlock}
                />
                <InspectorStyleFields
                  entity={entity as HiveBlock}
                  kind="block"
                  onPatch={onPatchBlock}
                />
              </>
            ) : null}
            {selection.kind === 'object' ? (
              <>
                <InspectorTransformFields
                  entity={entity as HiveObject}
                  kind="object"
                  onPatch={onPatchObject}
                />
                <InspectorStyleFields
                  entity={entity as HiveObject}
                  kind="object"
                  onPatch={onPatchObject}
                />
              </>
            ) : null}
            {selection.kind === 'npc' ? (
              <>
                <InspectorTransformFields
                  entity={entity as HiveNpc}
                  kind="npc"
                  onPatch={onPatchNpc}
                />
                <InspectorStyleFields
                  entity={entity as HiveNpc}
                  kind="npc"
                  onPatch={onPatchNpc}
                />
                <NpcPromptFields
                  entity={entity as HiveNpc}
                  onPatch={onPatchNpc}
                />
              </>
            ) : null}
            <button
              className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-dynamic-red/30 bg-dynamic-red/10 px-3 py-2 text-dynamic-red text-xs transition hover:bg-dynamic-red/15"
              onClick={() => onRequestDelete(selection)}
              type="button"
            >
              <Trash2 className="h-3.5 w-3.5" />
              {t('delete_selected')}
            </button>
          </>
        )}
      </div>
    </aside>
  );
}
