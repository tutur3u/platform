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
import type { HiveAgentMessage } from './hive-agent-composer';
import { HiveAgentStudioPanel } from './hive-agent-studio-panel';
import { HiveStudioCenter } from './hive-studio-center';
import { HiveStudioDialogs } from './hive-studio-dialogs';
import { HiveStudioServerPicker } from './hive-studio-server-picker';
import { HiveStudioToolDock } from './hive-studio-tool-dock';
import { HiveStudioTop } from './hive-studio-top';
import { ResearchTimeline } from './research-timeline';
import { useHiveDeleteSelectionShortcut } from './use-hive-delete-selection-shortcut';
import { isBoolean, useHivePersistedState } from './use-hive-persisted-state';
import { useHiveStudioEngine } from './use-hive-studio-engine';

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
  const [activePanel, setActivePanel] = useHivePersistedState<
    'agents' | 'timeline' | 'workflows' | 'world'
  >('hive.editor.mode', 'agents', { validate: isStudioMode });
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
          <HiveStudioToolDock
            engine={engine}
            onToggle={() => setBottomCollapsed(true)}
          />
        }
        bottomCollapsed={bottomCollapsed}
        center={
          <HiveStudioCenter
            activePanel={activePanel}
            agentMessages={agentMessages}
            bottomCollapsed={bottomCollapsed}
            chatOpen={chatOpen}
            engine={engine}
            isAdmin={isAdmin}
            miniMapCollapsed={miniMapCollapsed}
            onSelectEntity={selectEntity}
            onSetActivePanel={setActivePanel}
            onSetBottomCollapsed={setBottomCollapsed}
            onSetMiniMapCollapsed={setMiniMapCollapsed}
            onSetTopCollapsed={setTopCollapsed}
            onSubmitAgentPrompt={submitAgentPrompt}
            serverPicker={serverPicker}
            topCollapsed={topCollapsed}
          />
        }
        left={
          <HiveAgentStudioPanel
            aiContext={engine.aiContext}
            npcs={engine.npcs}
            onPatchNpc={engine.patchNpc}
            onSelectNpc={(npc) => selectEntity({ id: npc.id, kind: 'npc' })}
            revision={engine.revision}
            serverId={engine.serverId}
            world={engine.world}
          />
        }
        leftCollapsed={activePanel !== 'agents'}
        right={
          <ResearchTimeline
            onClose={() => setActivePanel('world')}
            serverId={engine.serverId}
          />
        }
        rightCollapsed={activePanel !== 'timeline'}
        top={
          <HiveStudioTop
            activePanel={activePanel}
            chatOpen={chatOpen}
            currentUser={currentUser}
            engine={engine}
            isAdmin={isAdmin}
            miniMapCollapsed={miniMapCollapsed}
            npcLabCollapsed={npcLabCollapsed}
            onChangePanel={setActivePanel}
            onRequestDeleteSelection={setDeleteSelectionTarget}
            onSetChatOpen={setChatOpen}
            onSetMiniMapCollapsed={setMiniMapCollapsed}
            onSetNpcLabCollapsed={setNpcLabCollapsed}
            onSetRightCollapsed={setRightCollapsed}
            rightCollapsed={rightCollapsed}
            serverPicker={serverPicker}
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
    </div>
  );
}

function isStudioMode(
  value: unknown
): value is 'agents' | 'timeline' | 'workflows' | 'world' {
  return (
    value === 'agents' ||
    value === 'timeline' ||
    value === 'workflows' ||
    value === 'world'
  );
}
