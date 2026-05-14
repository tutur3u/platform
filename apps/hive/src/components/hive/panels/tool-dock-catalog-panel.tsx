'use client';

import { Bot, Box, Cpu, Layers3 } from '@tuturuuu/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { npcCatalog, objectCatalog, terrainCatalog } from '@/engine/catalog';
import type { HiveBuildMode } from '@/engine/types';

type CatalogFolder = 'agents' | 'blocks' | 'objects' | 'systems';

type ToolDockCatalogPanelProps = {
  activeBuildMode: HiveBuildMode;
  activeObject: string;
  activeTerrain: string;
  onSelectBuildMode: (mode: HiveBuildMode) => void;
  onSelectObject: (id: string) => void;
  onSelectTerrain: (id: string) => void;
  onUseBuildTool: () => void;
};

const ASSET_SHEET = '/assets/hive/hive-voxel-asset-sheet.png';
const assetIndexById: Record<string, number> = {
  bridge: 13,
  'crop-soil': 2,
  crop: 16,
  fence: 12,
  garden: 3,
  grass: 0,
  greenhouse: 7,
  house: 6,
  lamp: 11,
  path: 1,
  resident: 21,
  sensor: 23,
  stone: 5,
  warehouse: 9,
  water: 4,
  well: 10,
  workshop: 8,
};

function getAssetPreviewStyle(id: string) {
  const index = assetIndexById[id];
  if (index === undefined) return null;
  const column = index % 6;
  const row = Math.floor(index / 6);

  return {
    backgroundImage: `url(${ASSET_SHEET})`,
    backgroundPosition: `${(column / 5) * 100}% ${(row / 4) * 100}%`,
    backgroundSize: '600% 500%',
  };
}

export function ToolDockCatalogPanel(props: ToolDockCatalogPanelProps) {
  const t = useTranslations('studio.dock');
  const [folder, setFolder] = useState<CatalogFolder>('blocks');
  const objectFolders = useMemo(
    () => ({
      objects: objectCatalog.filter((item) => item.category !== 'functional'),
      systems: objectCatalog.filter((item) => item.category === 'functional'),
    }),
    []
  );
  const activeItems =
    folder === 'blocks'
      ? terrainCatalog
      : folder === 'agents'
        ? npcCatalog
        : folder === 'objects'
          ? objectFolders.objects
          : objectFolders.systems;

  return (
    <>
      <div className="my-1 w-px shrink-0 bg-border" />
      <div className="flex items-center gap-1.5">
        {(
          [
            ['blocks', t('blocks'), 'terrain', Layers3],
            ['objects', t('objects'), 'object', Box],
            ['systems', t('systems'), 'object', Cpu],
            ['agents', t('npcs'), 'npc', Bot],
          ] as const
        ).map(([id, label, mode, Icon]) => (
          <Tooltip key={id}>
            <TooltipTrigger asChild>
              <button
                aria-label={label}
                aria-pressed={folder === id}
                className={[
                  'inline-flex h-10 w-10 items-center justify-center rounded-md border transition',
                  folder === id
                    ? 'border-dynamic-green bg-dynamic-green/10 text-foreground shadow-dynamic-green/20 shadow-inner'
                    : 'border-border bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground',
                ].join(' ')}
                onClick={() => {
                  setFolder(id);
                  props.onSelectBuildMode(mode);
                }}
                type="button"
              >
                <Icon className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">{label}</TooltipContent>
          </Tooltip>
        ))}
      </div>
      <div className="my-1 w-px shrink-0 bg-border" />
      <div className="flex max-w-[42vw] items-center gap-1.5 overflow-x-auto">
        {activeItems.map((item, index) => {
          const previewStyle = getAssetPreviewStyle(item.id);
          const selected =
            folder === 'blocks'
              ? props.activeTerrain === item.id
              : folder === 'agents'
                ? props.activeBuildMode === 'npc'
                : props.activeObject === item.id;

          return (
            <Tooltip key={item.id}>
              <TooltipTrigger asChild>
                <button
                  aria-label={`${item.label} ${item.shortcut ?? index + 1}`}
                  aria-pressed={selected}
                  className={[
                    'relative grid h-10 min-w-12 place-items-center rounded-md border px-1.5 transition',
                    selected
                      ? 'border-dynamic-green bg-dynamic-green/10 text-foreground shadow-dynamic-green/20 shadow-inner'
                      : 'border-border bg-background text-muted-foreground hover:border-foreground/25',
                  ].join(' ')}
                  onClick={() => {
                    if (folder === 'blocks') {
                      props.onSelectTerrain(item.id);
                      props.onSelectBuildMode('terrain');
                    } else if (folder === 'agents') {
                      props.onSelectBuildMode('npc');
                    } else {
                      props.onSelectObject(item.id);
                      props.onSelectBuildMode('object');
                    }
                    props.onUseBuildTool();
                  }}
                  type="button"
                >
                  <span
                    className="h-7 w-8 rounded border border-black/10 bg-center bg-cover shadow-sm"
                    style={previewStyle ?? { backgroundColor: item.color }}
                  />
                  <span className="absolute -right-1 -bottom-1 rounded bg-background px-1 text-[9px] text-muted-foreground leading-4 ring-1 ring-border">
                    {item.shortcut ?? index + 1}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </>
  );
}
