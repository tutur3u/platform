'use client';

import {
  Bot,
  Box,
  Eraser,
  MousePointer2,
  Move3d,
  Redo2,
  RotateCw,
  Undo2,
} from '@tuturuuu/icons';
import { objectCatalog, terrainCatalog } from '@/engine/catalog';
import type { HiveTool } from '@/engine/types';

type ToolDockProps = {
  activeObject: string;
  activeTerrain: string;
  onSelectObject: (id: string) => void;
  onSelectTerrain: (id: string) => void;
  onSetTool: (tool: HiveTool) => void;
  tool: HiveTool;
};

const toolItems = [
  { icon: MousePointer2, id: 'select', label: 'Select' },
  { icon: Box, id: 'terrain', label: 'Terrain' },
  { icon: Box, id: 'object', label: 'Object' },
  { icon: Bot, id: 'npc', label: 'NPC' },
  { icon: Eraser, id: 'erase', label: 'Erase' },
  { icon: Move3d, id: 'move', label: 'Move' },
  { icon: RotateCw, id: 'rotate', label: 'Rotate' },
] as const;

export function ToolDock(props: ToolDockProps) {
  return (
    <div className="absolute bottom-5 left-1/2 z-20 flex max-w-[min(920px,calc(100vw-2rem))] -translate-x-1/2 items-center gap-3 rounded border border-zinc-700 bg-zinc-950/92 p-2 shadow-2xl shadow-zinc-950/60 backdrop-blur">
      <div className="flex items-center gap-1">
        {toolItems.map(({ icon: Icon, id, label }) => (
          <button
            className={[
              'inline-flex h-10 w-10 items-center justify-center rounded border transition',
              props.tool === id
                ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100'
                : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-100',
            ].join(' ')}
            key={id}
            onClick={() => props.onSetTool(id)}
            title={label}
            type="button"
          >
            <Icon className="h-4 w-4" />
          </button>
        ))}
      </div>
      <div className="h-8 w-px bg-zinc-800" />
      <div className="flex items-center gap-1">
        {terrainCatalog.map((item) => (
          <button
            className={[
              'h-8 w-8 rounded border',
              props.activeTerrain === item.id
                ? 'border-zinc-100'
                : 'border-zinc-700',
            ].join(' ')}
            key={item.id}
            onClick={() => {
              props.onSelectTerrain(item.id);
              props.onSetTool('terrain');
            }}
            style={{ backgroundColor: item.color }}
            title={item.label}
            type="button"
          />
        ))}
      </div>
      <div className="flex items-center gap-1">
        {objectCatalog.map((item) => (
          <button
            className={[
              'h-8 min-w-12 rounded border px-2 text-xs',
              props.activeObject === item.id
                ? 'border-zinc-100 text-zinc-50'
                : 'border-zinc-700 text-zinc-400',
            ].join(' ')}
            key={item.id}
            onClick={() => {
              props.onSelectObject(item.id);
              props.onSetTool('object');
            }}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="h-8 w-px bg-zinc-800" />
      <button
        className="inline-flex h-10 w-10 items-center justify-center rounded border border-zinc-800 bg-zinc-900 text-zinc-500"
        title="Undo"
        type="button"
      >
        <Undo2 className="h-4 w-4" />
      </button>
      <button
        className="inline-flex h-10 w-10 items-center justify-center rounded border border-zinc-800 bg-zinc-900 text-zinc-500"
        title="Redo"
        type="button"
      >
        <Redo2 className="h-4 w-4" />
      </button>
    </div>
  );
}
