'use client';

import type { HiveServersResponse } from '@tuturuuu/internal-api/hive';
import { SatelliteWorkspaceShell } from '@tuturuuu/satellite';
import { useState } from 'react';
import type { HiveSelection, HiveServer, HiveUser } from '@/engine/types';
import { EditorTopChrome } from './editor-top-chrome';
import type { HiveAgentMessage } from './hive-agent-composer';
import { HiveStudioDialogs } from './hive-studio-dialogs';
import { HiveStudioToolDock } from './hive-studio-tool-dock';
import { HiveViewportOverlays } from './hive-viewport-overlays';
import { InspectorPanel } from './panels/inspector-panel';
import { useHiveDeleteSelectionShortcut } from './use-hive-delete-selection-shortcut';
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
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const [topCollapsed, setTopCollapsed] = useState(false);
  const [bottomCollapsed, setBottomCollapsed] = useState(false);
  const [npcLabCollapsed, setNpcLabCollapsed] = useState(true);
  const [chatOpen, setChatOpen] = useState(false);
  const [miniMapCollapsed, setMiniMapCollapsed] = useState(false);
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

  return (
    <>
      <SatelliteWorkspaceShell
        bottom={
          <HiveStudioToolDock
            engine={engine}
            isAdmin={isAdmin}
            onSetBottomCollapsed={setBottomCollapsed}
            onSetDeleteServerOpen={setDeleteServerOpen}
            onSetServerActionTarget={setServerActionTarget}
            onSetServerDialogMode={setServerDialogMode}
            onSetWorldAction={setWorldAction}
          />
        }
        bottomCollapsed={bottomCollapsed}
        center={
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
              onSelect={engine.setSelection}
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
              npcLabCollapsed={npcLabCollapsed}
              npcs={engine.npcs}
              onSetBottomCollapsed={setBottomCollapsed}
              onSetChatOpen={setChatOpen}
              onSetMiniMapCollapsed={setMiniMapCollapsed}
              onSetNpcLabCollapsed={setNpcLabCollapsed}
              onSetRightCollapsed={setRightCollapsed}
              onSetTopCollapsed={setTopCollapsed}
              onSubmitAgentPrompt={submitAgentPrompt}
              rightCollapsed={rightCollapsed}
              selectedServer={engine.selectedServer}
              selection={engine.selection}
              syncNotice={engine.syncNotice}
              topCollapsed={topCollapsed}
              world={engine.world}
            />
          </>
        }
        right={
          <InspectorPanel
            eventsCount={engine.eventsCount}
            npcs={engine.npcs}
            onPatchNpc={engine.patchNpc}
            onRequestDelete={setDeleteSelectionTarget}
            onToggle={() => setRightCollapsed(true)}
            presenceCount={engine.presenceCount}
            remoteAwareness={engine.remoteAwareness}
            realtimeStatus={engine.realtimeStatus}
            revision={engine.revision}
            selection={engine.selection}
            world={engine.world}
          />
        }
        rightCollapsed={rightCollapsed}
        top={
          <EditorTopChrome
            currentUser={currentUser}
            isRunningNpc={engine.isRunningNpc}
            npcLabCollapsed={npcLabCollapsed}
            npcs={engine.npcs}
            onPatchNpc={engine.patchNpc}
            onRunNpc={engine.runNpc}
            onToggleNpcLab={() => setNpcLabCollapsed((value) => !value)}
            presenceCount={engine.presenceCount}
            realtimeStatus={engine.realtimeStatus}
            revision={engine.revision}
            rightCollapsed={rightCollapsed}
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
