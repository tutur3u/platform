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
  onRotateSelection: () => void;
  onSetTool: (tool: HiveTool) => void;
  tool: HiveTool;
};

const toolItems = [
  { icon: MousePointer2, id: 'select', label: 'Select', shortcut: 'V' },
  { icon: Box, id: 'terrain', label: 'Terrain', shortcut: 'B' },
  { icon: Box, id: 'object', label: 'Object', shortcut: 'O' },
  { icon: Bot, id: 'npc', label: 'NPC', shortcut: 'N' },
  { icon: Eraser, id: 'erase', label: 'Erase', shortcut: 'E' },
  { icon: Move3d, id: 'move', label: 'Move', shortcut: 'M' },
  { icon: RotateCw, id: 'rotate', label: 'Rotate', shortcut: 'R' },
] as const;

export function ToolDock(props: ToolDockProps) {
  return (
    <div className="pointer-events-auto flex justify-center">
      <div className="flex max-w-full items-stretch gap-3 overflow-x-auto rounded-xl border border-border/70 bg-background/92 p-3 text-foreground shadow-2xl shadow-foreground/15 backdrop-blur-md">
        <div className="flex items-center gap-1.5">
          {toolItems.map(({ icon: Icon, id, label, shortcut }) => (
            <button
              aria-label={label}
              className={[
                'grid h-14 min-w-14 place-items-center rounded-lg border px-2 text-[11px] transition',
                props.tool === id
                  ? 'border-dynamic-green bg-dynamic-green/10 text-dynamic-green shadow-dynamic-green/20 shadow-inner'
                  : 'border-border bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground',
              ].join(' ')}
              key={id}
              onClick={() => {
                if (id === 'rotate') props.onRotateSelection();
                props.onSetTool(id);
              }}
              title={label}
              type="button"
            >
              <Icon className="h-4 w-4" />
              <span className="mt-1 leading-none">{shortcut}</span>
            </button>
          ))}
        </div>
        <div className="my-1 w-px shrink-0 bg-border" />
        <div className="flex items-center gap-1.5">
          {terrainCatalog.map((item, index) => (
            <button
              className={[
                'grid h-14 min-w-16 place-items-center rounded-lg border px-2 text-[11px] transition',
                props.activeTerrain === item.id
                  ? 'border-dynamic-green bg-dynamic-green/10 text-foreground shadow-dynamic-green/20 shadow-inner'
                  : 'border-border bg-background text-muted-foreground hover:border-foreground/25',
              ].join(' ')}
              key={item.id}
              onClick={() => {
                props.onSelectTerrain(item.id);
                props.onSetTool('terrain');
              }}
              title={item.label}
              type="button"
            >
              <span
                className="h-6 w-8 rounded-md border border-black/10 shadow-sm"
                style={{ backgroundColor: item.color }}
              />
              <span className="mt-1 leading-none">
                {item.shortcut ?? index + 1}
              </span>
            </button>
          ))}
        </div>
        <div className="my-1 w-px shrink-0 bg-border" />
        <div className="flex items-center gap-1.5">
          {objectCatalog.map((item, index) => (
            <button
              className={[
                'grid h-14 min-w-18 place-items-center rounded-lg border px-3 text-[11px] transition',
                props.activeObject === item.id
                  ? 'border-dynamic-green bg-dynamic-green/10 text-foreground shadow-dynamic-green/20 shadow-inner'
                  : 'border-border bg-background text-muted-foreground hover:border-foreground/25',
              ].join(' ')}
              key={item.id}
              onClick={() => {
                props.onSelectObject(item.id);
                props.onSetTool('object');
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
          ))}
        </div>
        <div className="my-1 w-px shrink-0 bg-border" />
        <div className="flex items-center gap-1.5">
          <button
            className="inline-flex h-14 w-12 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground"
            title="Undo"
            type="button"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            className="inline-flex h-14 w-12 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground"
            title="Redo"
            type="button"
          >
            <Redo2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
