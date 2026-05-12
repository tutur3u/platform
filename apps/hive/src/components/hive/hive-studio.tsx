'use client';

import type { HiveServersResponse } from '@tuturuuu/internal-api/hive';
import { SatelliteWorkspaceShell } from '@tuturuuu/satellite';
import { useEffect, useState } from 'react';
import type { HiveSelection, HiveServer, HiveUser } from '@/engine/types';
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
  const [leftCollapsed, setLeftCollapsed] = useState(true);
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const [topCollapsed, setTopCollapsed] = useState(false);
  const [bottomCollapsed, setBottomCollapsed] = useState(false);
  const [npcLabCollapsed, setNpcLabCollapsed] = useState(true);
  const [serverDialogMode, setServerDialogMode] = useState<
    'create' | 'edit' | null
  >(null);
  const [serverActionTarget, setServerActionTarget] =
    useState<HiveServer | null>(null);
  const [deleteServerOpen, setDeleteServerOpen] = useState(false);
  const [worldAction, setWorldAction] = useState<'clear' | 'reseed' | null>(
    null
  );
  const [deleteSelectionTarget, setDeleteSelectionTarget] =
    useState<NonNullable<HiveSelection> | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable
      ) {
        return;
      }

      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        engine.selection
      ) {
        event.preventDefault();
        if (event.metaKey || event.ctrlKey) {
          engine.eraseSelection(engine.selection);
          return;
        }
        setDeleteSelectionTarget(engine.selection);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [engine]);

  return (
    <>
      <SatelliteWorkspaceShell
        bottom={
          <ToolDock
            activeBuildMode={engine.activeBuildMode}
            activeObject={engine.activeObject}
            activeTerrain={engine.activeTerrain}
            autoTimeEnabled={engine.autoTimeEnabled}
            autoTimeSpeed={engine.autoTimeSpeed}
            gaplessMode={engine.gaplessMode}
            onRotateSelection={engine.rotateSelection}
            onSelectBuildMode={engine.setActiveBuildMode}
            onSelectObject={engine.setActiveObject}
            onSelectTerrain={engine.setActiveTerrain}
            onSetTool={engine.setTool}
            onToggle={() => setBottomCollapsed(true)}
            onToggleGapless={() => engine.setGaplessMode((value) => !value)}
            onSelectTimeTheme={engine.setTimeTheme}
            onSetAutoTimeSpeed={engine.setAutoTimeSpeed}
            onToggleAutoTime={() =>
              engine.setAutoTimeEnabled((value) => !value)
            }
            timeTheme={engine.timeTheme}
            tool={engine.tool}
          />
        }
        bottomCollapsed={bottomCollapsed}
        center={
          <>
            <HiveViewport
              activeBuildMode={engine.activeBuildMode}
              activeObject={engine.activeObject}
              activeTerrain={engine.activeTerrain}
              gaplessMode={engine.gaplessMode}
              npcs={engine.npcs}
              onErase={engine.eraseSelection}
              onMoveSelection={engine.moveSelection}
              onPlaceNpc={engine.placeNpc}
              onPlaceObject={engine.placeObject}
              onPlaceTerrain={engine.placeTerrain}
              onSelect={engine.setSelection}
              selection={engine.selection}
              tool={engine.tool}
              timeTheme={engine.timeTheme}
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
            currentUser={currentUser}
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
            onToggle={() => setLeftCollapsed(true)}
            servers={engine.servers}
          />
        }
        leftCollapsed={leftCollapsed}
        right={
          <InspectorPanel
            eventsCount={engine.eventsCount}
            npcs={engine.npcs}
            onPatchNpc={engine.patchNpc}
            onRequestDelete={setDeleteSelectionTarget}
            onToggle={() => setRightCollapsed(true)}
            presenceCount={engine.presenceCount}
            realtimeStatus={engine.realtimeStatus}
            revision={engine.revision}
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
            onToggleNpcLab={() => setNpcLabCollapsed(true)}
            presenceCount={engine.presenceCount}
            realtimeStatus={engine.realtimeStatus}
            revision={engine.revision}
            rightCollapsed={rightCollapsed}
            server={engine.selectedServer}
            simulatedMinutes={engine.simulatedMinutes}
            autoTimeEnabled={engine.autoTimeEnabled}
            timeTheme={engine.timeTheme}
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
        deleteSelectionTarget={deleteSelectionTarget}
        onDeleteSelection={(target) => engine.eraseSelection(target)}
        onSetDeleteSelectionTarget={setDeleteSelectionTarget}
        onUpdateServer={engine.updateServer}
        selectedServer={engine.selectedServer}
        serverActionTarget={serverActionTarget}
        serverDialogMode={serverDialogMode}
        worldAction={worldAction}
      />
    </>
  );
}
