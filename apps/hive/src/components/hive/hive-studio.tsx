'use client';

import type { HiveServersResponse } from '@tuturuuu/internal-api';
import { SatelliteWorkspaceShell } from '@tuturuuu/satellite';
import { useState } from 'react';
import type { HiveServer, HiveUser } from '@/engine/types';
import { EditorChromeControls } from './editor-chrome-controls';
import { EditorTopChrome } from './editor-top-chrome';
import { HiveStudioDialogs } from './hive-studio-dialogs';
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
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [topCollapsed, setTopCollapsed] = useState(false);
  const [bottomCollapsed, setBottomCollapsed] = useState(false);
  const [npcLabCollapsed, setNpcLabCollapsed] = useState(false);
  const [serverDialogMode, setServerDialogMode] = useState<
    'create' | 'edit' | null
  >(null);
  const [serverActionTarget, setServerActionTarget] =
    useState<HiveServer | null>(null);
  const [deleteServerOpen, setDeleteServerOpen] = useState(false);
  const [worldAction, setWorldAction] = useState<'clear' | 'reseed' | null>(
    null
  );

  return (
    <>
      <SatelliteWorkspaceShell
        bottom={
          <ToolDock
            activeObject={engine.activeObject}
            activeTerrain={engine.activeTerrain}
            onRotateSelection={engine.rotateSelection}
            onSelectObject={engine.setActiveObject}
            onSelectTerrain={engine.setActiveTerrain}
            onSetTool={engine.setTool}
            tool={engine.tool}
          />
        }
        bottomCollapsed={bottomCollapsed}
        center={
          <>
            <HiveViewport
              activeObject={engine.activeObject}
              activeTerrain={engine.activeTerrain}
              npcs={engine.npcs}
              onErase={engine.eraseSelection}
              onMoveSelection={engine.moveSelection}
              onPlaceNpc={engine.placeNpc}
              onPlaceObject={engine.placeObject}
              onPlaceTerrain={engine.placeTerrain}
              onSelect={engine.setSelection}
              selection={engine.selection}
              tool={engine.tool}
              world={engine.world}
            />
            <EditorChromeControls
              bottomCollapsed={bottomCollapsed}
              leftCollapsed={leftCollapsed}
              npcLabCollapsed={npcLabCollapsed}
              onToggleBottom={() => setBottomCollapsed((value) => !value)}
              onToggleLeft={() => setLeftCollapsed((value) => !value)}
              onToggleNpcLab={() => setNpcLabCollapsed((value) => !value)}
              onToggleRight={() => setRightCollapsed((value) => !value)}
              onToggleTop={() => setTopCollapsed((value) => !value)}
              rightCollapsed={rightCollapsed}
              topCollapsed={topCollapsed}
            />
            {engine.syncNotice ? (
              <div className="pointer-events-none absolute right-4 bottom-24 left-4 z-20 flex justify-center">
                <div className="rounded-lg border border-dynamic-yellow/40 bg-background/90 px-4 py-2 text-dynamic-yellow text-sm shadow-lg backdrop-blur">
                  {engine.syncNotice}
                </div>
              </div>
            ) : null}
          </>
        }
        left={
          <ServerNavigator
            activeServerId={engine.serverId}
            isAdmin={isAdmin}
            onCreateServer={() => {
              setServerActionTarget(null);
              setServerDialogMode('create');
            }}
            onDeleteServer={(server) => {
              setServerActionTarget(server);
              setDeleteServerOpen(true);
            }}
            onEditServer={(server) => {
              setServerActionTarget(server);
              setServerDialogMode('edit');
            }}
            onResetWorld={setWorldAction}
            onSelectServer={engine.setServerId}
            servers={engine.servers}
          />
        }
        leftCollapsed={leftCollapsed}
        right={
          <InspectorPanel
            npcs={engine.npcs}
            onPatchNpc={engine.patchNpc}
            selection={engine.selection}
            world={engine.world}
          />
        }
        rightCollapsed={rightCollapsed}
        top={
          <EditorTopChrome
            isRunningNpc={engine.isRunningNpc}
            npcLabCollapsed={npcLabCollapsed}
            npcs={engine.npcs}
            onPatchNpc={engine.patchNpc}
            onRunNpc={engine.runNpc}
            revision={engine.revision}
            server={engine.selectedServer}
            world={engine.world}
          />
        }
        topCollapsed={topCollapsed}
      />
      <HiveStudioDialogs
        deleteServerOpen={deleteServerOpen}
        onCreateServer={engine.createServerWithPayload}
        onDeleteServer={engine.deleteServer}
        onResetWorld={engine.resetWorld}
        onSetDeleteServerOpen={setDeleteServerOpen}
        onSetServerActionTarget={setServerActionTarget}
        onSetServerDialogMode={setServerDialogMode}
        onSetWorldAction={setWorldAction}
        onUpdateServer={engine.updateServer}
        selectedServer={engine.selectedServer}
        serverActionTarget={serverActionTarget}
        serverDialogMode={serverDialogMode}
        worldAction={worldAction}
      />
    </>
  );
}
