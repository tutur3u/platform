'use client';

import type { HiveServersResponse } from '@tuturuuu/internal-api';
import type { HiveUser } from '@/engine/types';
import { EditorTopChrome } from './editor-top-chrome';
import { InspectorPanel } from './panels/inspector-panel';
import { ServerNavigator } from './panels/server-navigator';
import { ToolDock } from './panels/tool-dock';
import { useHiveStudioEngine } from './use-hive-studio-engine';
import { HiveViewport } from './viewport/hive-viewport';

type HiveStudioProps = {
  currentUser: HiveUser;
  initialServers: HiveServersResponse;
  isAdmin: boolean;
  realtimeUrl: string;
};

export function HiveStudio({
  currentUser,
  initialServers,
  isAdmin,
  realtimeUrl,
}: HiveStudioProps) {
  const engine = useHiveStudioEngine({
    currentUser,
    initialServers,
    realtimeUrl,
  });

  return (
    <main className="flex h-dvh overflow-hidden bg-[#101114] text-zinc-100">
      <ServerNavigator
        activeServerId={engine.serverId}
        isAdmin={isAdmin}
        onCreateServer={engine.createServer}
        onSelectServer={engine.setServerId}
        servers={engine.servers}
      />
      <section className="relative min-w-0 flex-1 overflow-hidden">
        <HiveViewport
          activeObject={engine.activeObject}
          activeTerrain={engine.activeTerrain}
          npcs={engine.npcs}
          onErase={engine.eraseSelection}
          onPlaceNpc={engine.placeNpc}
          onPlaceObject={engine.placeObject}
          onPlaceTerrain={engine.placeTerrain}
          onSelect={engine.setSelection}
          selection={engine.selection}
          tool={engine.tool}
          world={engine.world}
        />
        <EditorTopChrome
          isRunningNpc={engine.isRunningNpc}
          npcs={engine.npcs}
          onPatchNpc={engine.patchNpc}
          onRunNpc={engine.runNpc}
          revision={engine.revision}
          server={engine.selectedServer}
          world={engine.world}
        />
        <ToolDock
          activeObject={engine.activeObject}
          activeTerrain={engine.activeTerrain}
          onSelectObject={engine.setActiveObject}
          onSelectTerrain={engine.setActiveTerrain}
          onSetTool={engine.setTool}
          tool={engine.tool}
        />
      </section>
      <InspectorPanel
        npcs={engine.npcs}
        onPatchNpc={engine.patchNpc}
        selection={engine.selection}
        world={engine.world}
      />
    </main>
  );
}
