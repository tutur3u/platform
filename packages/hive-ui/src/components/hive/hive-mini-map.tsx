'use client';

import { Map as MapIcon, Minimize2, ScanSearch } from '@tuturuuu/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import { getTerrainColor } from '../../engine/catalog';
import {
  getObjectFootprint,
  getObjectFootprintCenter,
} from '../../engine/footprint';
import type {
  HiveNpc,
  HiveSelection,
  HiveServer,
  HiveWorldData,
} from '../../engine/types';

type HiveMiniMapProps = {
  collapsed: boolean;
  npcs: HiveNpc[];
  onToggle: () => void;
  selection: HiveSelection;
  server?: HiveServer | null;
  world: HiveWorldData;
};

export function HiveMiniMap({
  collapsed,
  npcs,
  onToggle,
  selection,
  server,
  world,
}: HiveMiniMapProps) {
  const t = useTranslations('studio.minimap');

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            aria-label={t('open')}
            className="pointer-events-auto inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border bg-background/88 text-muted-foreground shadow-foreground/10 shadow-xl backdrop-blur-xl hover:text-foreground"
            onClick={onToggle}
            type="button"
          >
            <MapIcon className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">{t('open')}</TooltipContent>
      </Tooltip>
    );
  }

  const bounds = getMiniMapBounds(world, npcs);
  const size = Math.max(bounds.width, bounds.depth, 1);
  const viewBox = `${bounds.minX - 0.5} ${bounds.minZ - 0.5} ${size + 1} ${
    size + 1
  }`;

  return (
    <section
      aria-label={t('label')}
      className="pointer-events-auto w-48 rounded-xl border border-white/70 bg-background/82 p-2 shadow-2xl shadow-foreground/15 ring-1 ring-foreground/5 backdrop-blur-xl"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-dynamic-green/15 text-dynamic-green">
            <ScanSearch className="h-3.5 w-3.5" />
          </span>
          <span className="truncate font-medium text-xs">
            {server?.name ?? t('empty')}
          </span>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={t('collapse')}
              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={onToggle}
              type="button"
            >
              <Minimize2 className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="left">{t('collapse')}</TooltipContent>
        </Tooltip>
      </div>
      <svg
        aria-label={t('label')}
        className="block aspect-square w-full rounded-lg border border-border/70 bg-foreground/[0.04]"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        viewBox={viewBox}
      >
        <title>{t('label')}</title>
        {world.blocks.map((block) => (
          <rect
            fill={getTerrainColor(block.type)}
            height={0.96}
            key={block.id}
            opacity={selection?.id === block.id ? 1 : 0.86}
            stroke={selection?.id === block.id ? '#22c55e' : 'transparent'}
            strokeWidth={0.04}
            width={0.96}
            x={block.position.x - 0.48}
            y={block.position.z - 0.48}
          />
        ))}
        {world.objects.map((object) => {
          const footprint = getObjectFootprint(object.type, object.state);
          const center = getObjectFootprintCenter(object);

          return (
            <rect
              fill={selection?.id === object.id ? '#22c55e' : '#1f2937'}
              height={Math.max(0.28, footprint.depth * 0.42)}
              key={object.id}
              opacity={0.92}
              rx={0.05}
              stroke={selection?.id === object.id ? '#fef3c7' : 'transparent'}
              strokeWidth={0.04}
              width={Math.max(0.28, footprint.width * 0.42)}
              x={center.x - Math.max(0.28, footprint.width * 0.42) / 2}
              y={center.z - Math.max(0.28, footprint.depth * 0.42) / 2}
            />
          );
        })}
        {npcs.map((npc) => (
          <rect
            fill={selection?.id === npc.id ? '#22c55e' : '#f59e0b'}
            height={0.32}
            key={npc.id}
            width={0.32}
            x={npc.position.x - 0.16}
            y={npc.position.z - 0.16}
          />
        ))}
      </svg>
    </section>
  );
}

function getMiniMapBounds(world: HiveWorldData, npcs: HiveNpc[]) {
  const positions = [
    ...world.blocks.map((block) => block.position),
    ...world.objects.map((object) => object.position),
    ...npcs.map((npc) => npc.position),
  ];

  if (positions.length === 0) {
    return { depth: 1, minX: -0.5, minZ: -0.5, width: 1 };
  }

  const xs = positions.map((position) => position.x);
  const zs = positions.map((position) => position.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  return {
    depth: maxZ - minZ + 1,
    minX,
    minZ,
    width: maxX - minX + 1,
  };
}
