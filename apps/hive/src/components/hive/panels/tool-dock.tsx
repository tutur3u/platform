'use client';

import {
  Box,
  Eraser,
  MousePointer2,
  Move3d,
  PanelBottomClose,
  RotateCw,
  Settings2,
} from '@tuturuuu/icons';
import { Tooltip, TooltipContent, TooltipTrigger } from '@tuturuuu/ui/tooltip';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { useState } from 'react';
import type {
  HiveBuildMode,
  HiveCameraView,
  HiveSeason,
  HiveServer,
  HiveTool,
  HiveWeather,
} from '@/engine/types';
import { ToolDockCatalogPanel } from './tool-dock-catalog-panel';
import { ToolDockSettingsPanel } from './tool-dock-settings-panel';

type ToolDockProps = {
  activeBuildMode: HiveBuildMode;
  activeObject: string;
  activeTerrain: string;
  gaplessMode: boolean;
  autoTimeEnabled: boolean;
  autoTimeSpeed: number;
  cameraView: HiveCameraView;
  isRunningSimulationTick: boolean;
  onSelectBuildMode: (mode: HiveBuildMode) => void;
  onSelectCameraView: (view: HiveCameraView) => void;
  onSelectObject: (id: string) => void;
  onSelectTerrain: (id: string) => void;
  onRotateSelection: () => void;
  onRunSimulationTick: () => void;
  onSetClockMinutes: (minutes: number) => void;
  onSetSeason: (season: HiveSeason) => void;
  onSetWeather: (weather: HiveWeather) => void;
  onSetTool: (tool: HiveTool) => void;
  onToggle: () => void;
  onToggleGapless: () => void;
  onSetAutoTimeSpeed: (speed: number) => void;
  onToggleAutoTime: () => void;
  onUpdateServerSettings: (
    settings: NonNullable<HiveServer['settings']>
  ) => void;
  server?: HiveServer | null;
  serverPicker?: ReactNode;
  season: HiveSeason;
  simulatedMinutes: number;
  tool: HiveTool;
  weather: HiveWeather;
};

const toolItems = [
  { icon: MousePointer2, id: 'select', labelKey: 'select' },
  { icon: Box, id: 'build', labelKey: 'build' },
  { icon: Eraser, id: 'erase', labelKey: 'erase' },
  { icon: Move3d, id: 'move', labelKey: 'move' },
  { icon: RotateCw, id: 'rotate', labelKey: 'rotate' },
] as const;

type DockPanel = 'build' | 'settings';

export function ToolDock(props: ToolDockProps) {
  const t = useTranslations('studio.dock');
  const [panel, setPanel] = useState<DockPanel>('build');
  const showCatalog = props.tool === 'build' && panel === 'build';
  const showSettings = panel === 'settings';

  return (
    <div className="pointer-events-auto flex justify-center">
      <div className="flex max-w-[calc(100vw-2rem)] items-center gap-1.5 overflow-x-auto rounded-xl border border-white/60 bg-background/84 p-1.5 text-foreground shadow-2xl shadow-foreground/15 ring-1 ring-foreground/5 backdrop-blur-xl">
        {props.serverPicker}
        <div className="flex items-center gap-1.5">
          {toolItems.map(({ icon: Icon, id, labelKey }) => {
            const label = t(labelKey);

            return (
              <Tooltip key={id}>
                <TooltipTrigger asChild>
                  <button
                    aria-label={label}
                    className={[
                      'inline-flex h-10 w-10 items-center justify-center rounded-md border transition',
                      props.tool === id
                        ? 'border-dynamic-green bg-dynamic-green/10 text-dynamic-green shadow-dynamic-green/20 shadow-inner'
                        : 'border-border bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground',
                    ].join(' ')}
                    onClick={() => {
                      if (id === 'rotate') props.onRotateSelection();
                      if (id === 'build') setPanel('build');
                      props.onSetTool(id);
                    }}
                    type="button"
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top">{label}</TooltipContent>
              </Tooltip>
            );
          })}
        </div>
        <div className="my-1 w-px shrink-0 bg-border" />
        <div className="flex items-center gap-1.5">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-label={t('editor_settings')}
                aria-pressed={panel === 'settings'}
                className={[
                  'inline-flex h-10 w-10 items-center justify-center rounded-md border transition',
                  panel === 'settings'
                    ? 'border-dynamic-green bg-dynamic-green/10 text-foreground'
                    : 'border-border bg-background text-muted-foreground hover:border-foreground/25 hover:text-foreground',
                ].join(' ')}
                onClick={() =>
                  setPanel((value) =>
                    value === 'settings' ? 'build' : 'settings'
                  )
                }
                type="button"
              >
                <Settings2 className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="top">{t('editor_settings')}</TooltipContent>
          </Tooltip>
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
            cameraView={props.cameraView}
            gaplessMode={props.gaplessMode}
            onSelectCameraView={props.onSelectCameraView}
            onSetClockMinutes={props.onSetClockMinutes}
            onSetAutoTimeSpeed={props.onSetAutoTimeSpeed}
            onSetSeason={props.onSetSeason}
            onSetWeather={props.onSetWeather}
            onToggleAutoTime={props.onToggleAutoTime}
            onToggleGapless={props.onToggleGapless}
            onRunSimulationTick={props.onRunSimulationTick}
            onUpdateServerSettings={props.onUpdateServerSettings}
            isRunningSimulationTick={props.isRunningSimulationTick}
            season={props.season}
            server={props.server}
            simulatedMinutes={props.simulatedMinutes}
            weather={props.weather}
          />
        ) : null}
        <div className="my-1 w-px shrink-0 bg-border" />
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              aria-label={t('collapse')}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:text-foreground"
              onClick={props.onToggle}
              type="button"
            >
              <PanelBottomClose className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top">{t('collapse')}</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
