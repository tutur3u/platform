'use client';

import type { HiveServersResponse } from '@tuturuuu/internal-api/hive';
import { SatelliteWorkspaceShell } from '@tuturuuu/satellite';
import { useEffect, useState } from 'react';
import type {
  HiveBuildInfo,
  HiveSelection,
  HiveServer,
  HiveUser,
} from '@/engine/types';
import { EditorTopChrome } from './editor-top-chrome';
import type { HiveAgentMessage } from './hive-agent-composer';
import { HiveStudioDialogs } from './hive-studio-dialogs';
import { HiveStudioServerPicker } from './hive-studio-server-picker';
import { HiveStudioToolDock } from './hive-studio-tool-dock';
import { HiveViewportOverlays } from './hive-viewport-overlays';
import { InspectorPanel } from './panels/inspector-panel';
import { useHiveDeleteSelectionShortcut } from './use-hive-delete-selection-shortcut';
import { isBoolean, useHivePersistedState } from './use-hive-persisted-state';
import { useHiveStudioEngine } from './use-hive-studio-engine';
import { HiveViewport } from './viewport/hive-viewport';
import { HiveWorkflowStudio } from './workflows/hive-workflow-studio';

type HiveStudioProps = {
  buildInfo: HiveBuildInfo;
  currentUser: HiveUser;
  initialServers: HiveServersResponse;
  isAdmin: boolean;
  realtimeUrl: string;
};

export function HiveStudio({
  buildInfo,
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
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const [topCollapsed, setTopCollapsed] = useHivePersistedState(
    'hive.editor.topCollapsed',
    false,
    { validate: isBoolean }
  );
  const [bottomCollapsed, setBottomCollapsed] = useHivePersistedState(
    'hive.editor.bottomCollapsed',
    false,
    { validate: isBoolean }
  );
  const [npcLabCollapsed, setNpcLabCollapsed] = useHivePersistedState(
    'hive.editor.npcLabCollapsed',
    true,
    { validate: isBoolean }
  );
  const [chatOpen, setChatOpen] = useHivePersistedState(
    'hive.editor.chatOpen',
    false,
    { validate: isBoolean }
  );
  const [studioMode, setStudioMode] = useHivePersistedState<
    'workflows' | 'world'
  >('hive.editor.mode', 'world', { validate: isStudioMode });
  const [miniMapCollapsed, setMiniMapCollapsed] = useHivePersistedState(
    'hive.editor.miniMapCollapsed',
    false,
    { validate: isBoolean }
  );
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
  const [agentMessages, setAgentMessages] = useState<HiveAgentMessage[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => setHydrated(true), []);
  useEffect(() => {
    if (!engine.selection) {
      setRightCollapsed(true);
    }
  }, [engine.selection]);

  const submitAgentPrompt = (prompt: string) => {
    const result = engine.applyAgentInstruction(prompt);
    setAgentMessages((messages) => [
      ...messages.slice(-4),
      { content: prompt, id: `user-${Date.now()}`, role: 'user' },
      { content: result.summary, id: `agent-${Date.now()}`, role: 'agent' },
    ]);
  };

  useHiveDeleteSelectionShortcut({
    onEraseSelection: engine.eraseSelection,
    onRequestDelete: setDeleteSelectionTarget,
    selection: engine.selection,
  });

  const selectEntity = (selection: HiveSelection) => {
    engine.setSelection(selection);
    if (selection) {
      setRightCollapsed(false);
    } else {
      setRightCollapsed(true);
    }
  };

  const serverPicker = (
    <HiveStudioServerPicker
      buildInfo={buildInfo}
      engine={engine}
      isAdmin={isAdmin}
      onSetDeleteServerOpen={setDeleteServerOpen}
      onSetServerActionTarget={setServerActionTarget}
      onSetServerDialogMode={setServerDialogMode}
      onSetWorldAction={setWorldAction}
    />
  );

  return (
    <div className="contents" data-hive-ready={hydrated ? 'true' : 'false'}>
      <SatelliteWorkspaceShell
        bottom={
          studioMode === 'world' ? (
            <HiveStudioToolDock
              engine={engine}
              onToggle={() => setBottomCollapsed(true)}
            />
          ) : null
        }
        bottomCollapsed={bottomCollapsed || studioMode !== 'world'}
        center={
          studioMode === 'world' ? (
            <>
              <HiveViewport
                activeBuildMode={engine.activeBuildMode}
                activeObject={engine.activeObject}
                activeTerrain={engine.activeTerrain}
                cameraView={engine.cameraView}
                gaplessMode={engine.gaplessMode}
                npcs={engine.npcs}
                onErase={engine.eraseSelection}
                onMoveSelection={engine.moveSelection}
                onPlaceNpc={engine.placeNpc}
                onPlaceObject={engine.placeObject}
                onPlaceTerrain={engine.placeTerrain}
                onRealtimeCursor={engine.sendCursorPosition}
                onSelect={selectEntity}
                remoteAwareness={engine.remoteAwareness}
                season={engine.season}
                selection={engine.selection}
                tool={engine.tool}
                timeTheme={engine.timeTheme}
                weather={engine.weather}
                world={engine.world}
              />
              <HiveViewportOverlays
                agentMessages={agentMessages}
                bottomCollapsed={bottomCollapsed}
                chatOpen={chatOpen}
                miniMapCollapsed={miniMapCollapsed}
                npcs={engine.npcs}
                onSetBottomCollapsed={setBottomCollapsed}
                onSetMiniMapCollapsed={setMiniMapCollapsed}
                onSetTopCollapsed={setTopCollapsed}
                onSubmitAgentPrompt={submitAgentPrompt}
                selectedServer={engine.selectedServer}
                selection={engine.selection}
                syncNotice={engine.syncNotice}
                topCollapsed={topCollapsed}
                world={engine.world}
              />
            </>
          ) : (
            <HiveWorkflowStudio
              isAdmin={isAdmin}
              onExitWorkflows={() => setStudioMode('world')}
              serverId={engine.serverId}
              serverPicker={serverPicker}
            />
          )
        }
        rightCollapsed={rightCollapsed}
        top={
          studioMode === 'world' ? (
            <EditorTopChrome
              chatOpen={chatOpen}
              currentUser={currentUser}
              inspectorPanel={
                <InspectorPanel
                  npcs={engine.npcs}
                  onPatchBlock={engine.patchBlock}
                  onPatchNpc={engine.patchNpc}
                  onPatchObject={engine.patchObject}
                  onRequestDelete={setDeleteSelectionTarget}
                  onToggle={() => setRightCollapsed(true)}
                  selection={engine.selection}
                  world={engine.world}
                />
              }
              isRunningNpc={engine.isRunningNpc}
              miniMapCollapsed={miniMapCollapsed}
              mode={studioMode}
              npcLabCollapsed={npcLabCollapsed}
              npcs={engine.npcs}
              onChangeMode={setStudioMode}
              onToggleChat={() => setChatOpen((value) => !value)}
              onToggleInspector={() =>
                setRightCollapsed((value) => (engine.selection ? !value : true))
              }
              onToggleMiniMap={() => setMiniMapCollapsed((value) => !value)}
              onPatchNpc={engine.patchNpc}
              onRunNpc={engine.runNpc}
              onToggleNpcLab={() => setNpcLabCollapsed((value) => !value)}
              presenceCount={engine.presenceCount}
              realtimeStatus={engine.realtimeStatus}
              revision={engine.revision}
              rightCollapsed={rightCollapsed}
              serverPicker={serverPicker}
              world={engine.world}
            />
          ) : null
        }
        topCollapsed={topCollapsed || studioMode !== 'world'}
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
    </div>
  );
}

function isStudioMode(value: unknown): value is 'workflows' | 'world' {
  return value === 'workflows' || value === 'world';
}
