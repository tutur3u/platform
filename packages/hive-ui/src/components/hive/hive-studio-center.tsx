'use client';

import type { Dispatch, ReactNode, SetStateAction } from 'react';
import type { HiveSelection } from '../../engine/types';
import type { HiveAgentMessage } from './hive-agent-composer';
import { HiveViewportOverlays } from './hive-viewport-overlays';
import type { useHiveStudioEngine } from './use-hive-studio-engine';
import { HiveViewport } from './viewport/hive-viewport';
import { HiveWorkflowStudio } from './workflows/hive-workflow-studio';

type HiveStudioCenterProps = {
  activePanel: 'agents' | 'timeline' | 'workflows' | 'world';
  agentMessages: HiveAgentMessage[];
  bottomCollapsed: boolean;
  chatOpen: boolean;
  engine: ReturnType<typeof useHiveStudioEngine>;
  initialWorkflowId?: string | null;
  isAdmin: boolean;
  miniMapCollapsed: boolean;
  onSelectEntity: (selection: HiveSelection) => void;
  onSetActivePanel: (
    panel: 'agents' | 'timeline' | 'workflows' | 'world'
  ) => void;
  onSetBottomCollapsed: Dispatch<SetStateAction<boolean>>;
  onSetMiniMapCollapsed: Dispatch<SetStateAction<boolean>>;
  onSetTopCollapsed: Dispatch<SetStateAction<boolean>>;
  onSubmitAgentPrompt: (prompt: string) => void;
  serverPicker: ReactNode;
  topCollapsed: boolean;
};

export function HiveStudioCenter({
  activePanel,
  agentMessages,
  bottomCollapsed,
  chatOpen,
  engine,
  initialWorkflowId,
  isAdmin,
  miniMapCollapsed,
  onSelectEntity,
  onSetActivePanel,
  onSetBottomCollapsed,
  onSetMiniMapCollapsed,
  onSetTopCollapsed,
  onSubmitAgentPrompt,
  serverPicker,
  topCollapsed,
}: HiveStudioCenterProps) {
  return (
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
        onSelect={onSelectEntity}
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
        onSetBottomCollapsed={onSetBottomCollapsed}
        onSetMiniMapCollapsed={onSetMiniMapCollapsed}
        onSetTopCollapsed={onSetTopCollapsed}
        onSubmitAgentPrompt={onSubmitAgentPrompt}
        selectedServer={engine.selectedServer}
        selection={engine.selection}
        syncNotice={engine.syncNotice}
        topCollapsed={topCollapsed}
        world={engine.world}
      />
      {activePanel === 'workflows' ? (
        <div className="absolute top-24 right-8 bottom-8 left-8 z-30 overflow-hidden rounded-xl border border-border/70 bg-background shadow-2xl shadow-foreground/20">
          <HiveWorkflowStudio
            initialWorkflowId={initialWorkflowId}
            isAdmin={isAdmin}
            onExitWorkflows={() => onSetActivePanel('world')}
            serverId={engine.serverId}
            serverPicker={serverPicker}
          />
        </div>
      ) : null}
    </>
  );
}
