'use client';

import type { Dispatch, SetStateAction } from 'react';
import type { HiveServer } from '@/engine/types';
import { HiveServerPicker } from './panels/hive-server-picker';
import { ToolDock } from './panels/tool-dock';
import type { useHiveStudioEngine } from './use-hive-studio-engine';

type HiveStudioEngine = ReturnType<typeof useHiveStudioEngine>;

type HiveStudioToolDockProps = {
  engine: HiveStudioEngine;
  isAdmin: boolean;
  onSetBottomCollapsed: Dispatch<SetStateAction<boolean>>;
  onSetDeleteServerOpen: Dispatch<SetStateAction<boolean>>;
  onSetServerActionTarget: Dispatch<SetStateAction<HiveServer | null>>;
  onSetServerDialogMode: Dispatch<SetStateAction<'create' | 'edit' | null>>;
  onSetWorldAction: Dispatch<SetStateAction<'clear' | 'reseed' | null>>;
};

export function HiveStudioToolDock({
  engine,
  isAdmin,
  onSetBottomCollapsed,
  onSetDeleteServerOpen,
  onSetServerActionTarget,
  onSetServerDialogMode,
  onSetWorldAction,
}: HiveStudioToolDockProps) {
  return (
    <ToolDock
      activeBuildMode={engine.activeBuildMode}
      activeObject={engine.activeObject}
      activeTerrain={engine.activeTerrain}
      autoTimeEnabled={engine.autoTimeEnabled}
      autoTimeSpeed={engine.autoTimeSpeed}
      gaplessMode={engine.gaplessMode}
      isRunningSimulationTick={engine.isRunningSimulationTick}
      onRotateSelection={engine.rotateSelection}
      onRunSimulationTick={engine.runSimulationTick}
      onSelectBuildMode={engine.setActiveBuildMode}
      onSelectObject={engine.setActiveObject}
      onSelectTerrain={engine.setActiveTerrain}
      onSelectTimeTheme={engine.setTimeTheme}
      onSetAutoTimeSpeed={engine.setAutoTimeSpeed}
      onSetTool={engine.setTool}
      onToggle={() => onSetBottomCollapsed(true)}
      onToggleAutoTime={() => engine.setAutoTimeEnabled((value) => !value)}
      onToggleGapless={() => engine.setGaplessMode((value) => !value)}
      onUpdateServerSettings={engine.updateServerSettings}
      server={engine.selectedServer}
      serverPicker={
        <HiveServerPicker
          activeServerId={engine.serverId}
          isAdmin={isAdmin}
          npcs={engine.npcs}
          onCreateServer={() => {
            onSetServerActionTarget(null);
            onSetServerDialogMode('create');
          }}
          onDeleteServer={(server) => {
            onSetServerActionTarget(server);
            onSetDeleteServerOpen(true);
          }}
          onEditServer={(server) => {
            onSetServerActionTarget(server);
            onSetServerDialogMode('edit');
          }}
          onResetWorld={onSetWorldAction}
          onSelectServer={engine.setServerId}
          presenceCount={engine.presenceCount}
          realtimeStatus={engine.realtimeStatus}
          revision={engine.revision}
          server={engine.selectedServer}
          servers={engine.servers}
          world={engine.world}
        />
      }
      timeTheme={engine.timeTheme}
      tool={engine.tool}
    />
  );
}
