'use client';

import { Bot, Box, Cpu, Layers3 } from '@tuturuuu/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { npcCatalog, objectCatalog, terrainCatalog } from '@/engine/catalog';
import { getObjectFootprintLabel } from '@/engine/footprint';
import type { HiveBuildMode } from '@/engine/types';
import {
  CatalogPreviewSwatch,
  getAssetPreviewStyle,
} from './tool-dock-catalog-preview';

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
          const footprintLabel =
            folder === 'objects' || folder === 'systems'
              ? getObjectFootprintLabel(item.id)
              : null;
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
                  <CatalogPreviewSwatch
                    color={item.color}
                    id={item.id}
                    mode={folder === 'blocks' ? 'terrain' : 'asset'}
                    previewStyle={previewStyle}
                  />
                  {footprintLabel && footprintLabel !== '1x1' ? (
                    <span className="absolute top-0.5 left-0.5 rounded bg-background/95 px-1 text-[9px] text-dynamic-green leading-4 ring-1 ring-dynamic-green/30">
                      {footprintLabel}
                    </span>
                  ) : null}
                  <span className="absolute -right-1 -bottom-1 rounded bg-background px-1 text-[9px] text-muted-foreground leading-4 ring-1 ring-border">
                    {item.shortcut ?? index + 1}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="top">
                {footprintLabel
                  ? `${item.label} / ${footprintLabel}`
                  : item.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </>
  );
}
