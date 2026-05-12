'use client';

import {
  Box,
  Eraser,
  MousePointer2,
  Move3d,
  PanelBottomClose,
  Redo2,
  RotateCw,
  Settings2,
  Undo2,
} from '@tuturuuu/icons';
import { useState } from 'react';
import type { HiveBuildMode, HiveTimeTheme, HiveTool } from '@/engine/types';
import { ToolDockCatalogPanel } from './tool-dock-catalog-panel';
import { ToolDockSettingsPanel } from './tool-dock-settings-panel';

type ToolDockProps = {
  activeBuildMode: HiveBuildMode;
  activeObject: string;
  activeTerrain: string;
  gaplessMode: boolean;
  autoTimeEnabled: boolean;
  autoTimeSpeed: number;
  onSelectBuildMode: (mode: HiveBuildMode) => void;
  onSelectObject: (id: string) => void;
  onSelectTerrain: (id: string) => void;
  onRotateSelection: () => void;
  onSetTool: (tool: HiveTool) => void;
  onToggle: () => void;
  onToggleGapless: () => void;
  onSelectTimeTheme: (theme: HiveTimeTheme) => void;
  onSetAutoTimeSpeed: (speed: number) => void;
  onToggleAutoTime: () => void;
  timeTheme: HiveTimeTheme;
  tool: HiveTool;
};

const toolItems = [
  { icon: MousePointer2, id: 'select', label: 'Select', shortcut: 'V' },
  { icon: Box, id: 'build', label: 'Build', shortcut: 'B' },
  { icon: Eraser, id: 'erase', label: 'Erase', shortcut: 'E' },
  { icon: Move3d, id: 'move', label: 'Move', shortcut: 'M' },
  { icon: RotateCw, id: 'rotate', label: 'Rotate', shortcut: 'R' },
] as const;

type DockPanel = 'build' | 'settings';

export function ToolDock(props: ToolDockProps) {
  const [panel, setPanel] = useState<DockPanel>('build');
  const showCatalog = props.tool === 'build' && panel === 'build';
  const showSettings = panel === 'settings';

  return (
    <div className="pointer-events-auto flex justify-center">
      <div className="flex max-w-[calc(100vw-2rem)] items-stretch gap-3 overflow-x-auto rounded-xl border border-border/70 bg-background/92 p-3 text-foreground shadow-2xl shadow-foreground/15 backdrop-blur-md">
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
                if (id === 'build') setPanel('build');
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
          <button
            aria-pressed={panel === 'settings'}
            className={[
              'grid h-14 min-w-16 place-items-center rounded-lg border px-3 text-[11px] transition',
              panel === 'settings'
                ? 'border-dynamic-green bg-dynamic-green/10 text-foreground'
                : 'border-border bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground',
            ].join(' ')}
            onClick={() =>
              setPanel((value) => (value === 'settings' ? 'build' : 'settings'))
            }
            title="Editor settings"
            type="button"
          >
            <Settings2 className="h-4 w-4" />
            <span className="mt-1 leading-none">Settings</span>
          </button>
        </div>
        {showCatalog ? (
          <ToolDockCatalogPanel
            activeBuildMode={props.activeBuildMode}
            activeObject={props.activeObject}
            activeTerrain={props.activeTerrain}
            onSelectBuildMode={props.onSelectBuildMode}
            onSelectObject={props.onSelectObject}
            onSelectTerrain={props.onSelectTerrain}
            onUseBuildTool={() => props.onSetTool('build')}
          />
        ) : null}
        {showSettings ? (
          <ToolDockSettingsPanel
            autoTimeEnabled={props.autoTimeEnabled}
            autoTimeSpeed={props.autoTimeSpeed}
            gaplessMode={props.gaplessMode}
            onSelectTimeTheme={props.onSelectTimeTheme}
            onSetAutoTimeSpeed={props.onSetAutoTimeSpeed}
            onToggleAutoTime={props.onToggleAutoTime}
            onToggleGapless={props.onToggleGapless}
            timeTheme={props.timeTheme}
          />
        ) : null}
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
        <div className="my-1 w-px shrink-0 bg-border" />
        <button
          className="inline-flex h-14 w-12 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground hover:text-foreground"
          onClick={props.onToggle}
          title="Collapse tool dock"
          type="button"
        >
          <PanelBottomClose className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
