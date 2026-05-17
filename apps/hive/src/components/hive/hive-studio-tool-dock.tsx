'use client';

import { ToolDock } from './panels/tool-dock';
import type { useHiveStudioEngine } from './use-hive-studio-engine';

type HiveStudioEngine = ReturnType<typeof useHiveStudioEngine>;

type HiveStudioToolDockProps = {
  engine: HiveStudioEngine;
  onToggle: () => void;
};

export function HiveStudioToolDock({
  engine,
  onToggle,
}: HiveStudioToolDockProps) {
  return (
    <ToolDock
      activeBuildMode={engine.activeBuildMode}
      activeObject={engine.activeObject}
      activeTerrain={engine.activeTerrain}
      autoTimeEnabled={engine.autoTimeEnabled}
      autoTimeSpeed={engine.autoTimeSpeed}
      cameraView={engine.cameraView}
      cropsCount={engine.cropsCount}
      currency={engine.currency}
      eventsCount={engine.eventsCount}
      gaplessMode={engine.gaplessMode}
      isRunningSimulationTick={engine.isRunningSimulationTick}
      onRotateSelection={engine.rotateSelection}
      onRunSimulationTick={engine.runSimulationTick}
      onSelectBuildMode={engine.setActiveBuildMode}
      onSelectCameraView={engine.setCameraView}
      onSelectObject={engine.setActiveObject}
      onSelectTerrain={engine.setActiveTerrain}
      onSetAutoTimeSpeed={engine.setAutoTimeSpeed}
      onSetClockMinutes={engine.setClockMinutes}
      onSetSeason={engine.setSeason}
      onSetTool={engine.setTool}
      onSetWeather={engine.setWeather}
      onToggle={onToggle}
      onToggleAutoTime={() => engine.setAutoTimeEnabled((value) => !value)}
      onToggleGapless={() => engine.setGaplessMode((value) => !value)}
      onUpdateServerSettings={engine.updateServerSettings}
      presenceCount={engine.presenceCount}
      realtimeStatus={engine.realtimeStatus}
      revision={engine.revision}
      season={engine.season}
      server={engine.selectedServer}
      serverName={engine.selectedServer?.name}
      simulatedMinutes={engine.simulatedMinutes}
      syncNotice={engine.syncNotice}
      tool={engine.tool}
      warehousesCount={engine.warehousesCount}
      weather={engine.weather}
      worldCounts={engine.worldCounts}
    />
  );
}
