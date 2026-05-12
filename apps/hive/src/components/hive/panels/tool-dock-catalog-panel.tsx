'use client';

import { Bot, Folder } from '@tuturuuu/icons';
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

export function ToolDockCatalogPanel(props: ToolDockCatalogPanelProps) {
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
            ['blocks', 'Blocks', 'terrain'],
            ['objects', 'Objects', 'object'],
            ['systems', 'Systems', 'object'],
            ['agents', 'Agents', 'npc'],
          ] as const
        ).map(([id, label, mode]) => (
          <button
            className={[
              'grid h-14 min-w-16 place-items-center rounded-lg border px-3 text-[11px] transition',
              folder === id
                ? 'border-dynamic-green bg-dynamic-green/10 text-foreground shadow-dynamic-green/20 shadow-inner'
                : 'border-border bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground',
            ].join(' ')}
            key={id}
            onClick={() => {
              setFolder(id);
              props.onSelectBuildMode(mode);
            }}
            title={label}
            type="button"
          >
            {id === 'agents' ? (
              <Bot className="h-4 w-4" />
            ) : (
              <Folder className="h-4 w-4" />
            )}
            <span className="mt-1 leading-none">{label}</span>
          </button>
        ))}
      </div>
      <div className="my-1 w-px shrink-0 bg-border" />
      <div className="flex max-w-[42vw] items-center gap-1.5 overflow-x-auto">
        {activeItems.map((item, index) => {
          const selected =
            folder === 'blocks'
              ? props.activeTerrain === item.id
              : folder === 'agents'
                ? props.activeBuildMode === 'npc'
                : props.activeObject === item.id;

          return (
            <button
              className={[
                'grid h-14 min-w-18 place-items-center rounded-lg border px-3 text-[11px] transition',
                selected
                  ? 'border-dynamic-green bg-dynamic-green/10 text-foreground shadow-dynamic-green/20 shadow-inner'
                  : 'border-border bg-background text-muted-foreground hover:border-foreground/25',
              ].join(' ')}
              key={item.id}
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
                className="h-5 w-8 rounded-md border border-black/10 shadow-sm"
                style={{ backgroundColor: item.color }}
              />
              <span className="mt-1 leading-none">
                {item.label} {item.shortcut ?? index + 1}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
