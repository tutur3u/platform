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
      season={engine.season}
      server={engine.selectedServer}
      simulatedMinutes={engine.simulatedMinutes}
      tool={engine.tool}
      weather={engine.weather}
    />
  );
}
