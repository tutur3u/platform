'use client';

import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { HiveSelection, HiveUser } from '../../engine/types';
import { EditorTopChrome } from './editor-top-chrome';
import { InspectorPanel } from './panels/inspector-panel';
import type { useHiveStudioEngine } from './use-hive-studio-engine';

type HiveStudioTopProps = {
  activePanel: 'agents' | 'timeline' | 'workflows' | 'world';
  chatOpen: boolean;
  currentUser: HiveUser;
  engine: ReturnType<typeof useHiveStudioEngine>;
  isAdmin: boolean;
  miniMapCollapsed: boolean;
  npcLabCollapsed: boolean;
  onChangePanel: (panel: 'agents' | 'timeline' | 'workflows' | 'world') => void;
  onRequestDeleteSelection: (selection: NonNullable<HiveSelection>) => void;
  onSetChatOpen: Dispatch<SetStateAction<boolean>>;
  onSetMiniMapCollapsed: Dispatch<SetStateAction<boolean>>;
  onSetNpcLabCollapsed: Dispatch<SetStateAction<boolean>>;
  onSetRightCollapsed: Dispatch<SetStateAction<boolean>>;
  rightCollapsed: boolean;
  serverPicker: ReactNode;
};

export function HiveStudioTop({
  activePanel,
  chatOpen,
  currentUser,
  engine,
  isAdmin,
  miniMapCollapsed,
  npcLabCollapsed,
  onChangePanel,
  onRequestDeleteSelection,
  onSetChatOpen,
  onSetMiniMapCollapsed,
  onSetNpcLabCollapsed,
  onSetRightCollapsed,
  rightCollapsed,
  serverPicker,
}: HiveStudioTopProps) {
  return (
    <EditorTopChrome
      aiContext={engine.aiContext}
      chatOpen={chatOpen}
      currentUser={currentUser}
      inspectorPanel={
        <InspectorPanel
          npcs={engine.npcs}
          onPatchBlock={engine.patchBlock}
          onPatchNpc={engine.patchNpc}
          onPatchObject={engine.patchObject}
          onRequestDelete={onRequestDeleteSelection}
          onToggle={() => onSetRightCollapsed(() => true)}
          selection={engine.selection}
          world={engine.world}
        />
      }
      isAdmin={isAdmin}
      isRunningNpc={engine.isRunningNpc}
      lastNpcRunStatus={engine.lastNpcRunStatus}
      miniMapCollapsed={miniMapCollapsed}
      mode={activePanel}
      npcLabCollapsed={npcLabCollapsed}
      npcs={engine.npcs}
      onChangeMode={onChangePanel}
      onPatchNpc={engine.patchNpc}
      onRunNpc={engine.runNpc}
      onRunNpcInteraction={engine.runNpcInteraction}
      onToggleChat={() => onSetChatOpen((value) => !value)}
      onToggleInspector={() =>
        onSetRightCollapsed((value) => (engine.selection ? !value : true))
      }
      onToggleMiniMap={() => onSetMiniMapCollapsed((value) => !value)}
      onToggleNpcLab={() => onSetNpcLabCollapsed((value) => !value)}
      onUpdateServerSettings={engine.updateServerSettings}
      presenceCount={engine.presenceCount}
      realtimeStatus={engine.realtimeStatus}
      revision={engine.revision}
      rightCollapsed={rightCollapsed}
      selectedNpc={engine.selectedNpc}
      selectedServer={engine.selectedServer ?? null}
      serverPicker={serverPicker}
      world={engine.world}
    />
  );
}
