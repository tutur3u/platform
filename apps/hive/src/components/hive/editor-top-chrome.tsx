import type { ReactNode } from 'react';
import type { HiveNpc, HiveUser, HiveWorldData } from '@/engine/types';
import type { HiveRealtimeStatus } from '@/realtime/hive-realtime-client';
import { HiveStatusBadgeGroup } from './hive-status-badge-group';
import { HiveTopRightToolbar } from './hive-top-right-toolbar';
import { NpcLabPanel } from './panels/npc-lab-panel';

type EditorTopChromeProps = {
  chatOpen: boolean;
  currentUser: HiveUser;
  inspectorPanel: ReactNode;
  isRunningNpc: boolean;
  miniMapCollapsed: boolean;
  mode: 'workflows' | 'world';
  npcLabCollapsed: boolean;
  onChangeMode: (mode: 'workflows' | 'world') => void;
  npcs: HiveNpc[];
  onToggleChat: () => void;
  onToggleInspector: () => void;
  onToggleMiniMap: () => void;
  onPatchNpc: (id: string, patch: Partial<HiveNpc>) => void;
  onRunNpc: (
    npcId: string,
    promptMode: 'custom' | 'default' | 'enhanced'
  ) => void;
  onToggleNpcLab: () => void;
  presenceCount: number;
  realtimeStatus: HiveRealtimeStatus;
  revision: number;
  rightCollapsed: boolean;
  serverPicker: ReactNode;
  world: HiveWorldData;
};

export function EditorTopChrome({
  chatOpen,
  currentUser,
  inspectorPanel,
  isRunningNpc,
  miniMapCollapsed,
  mode,
  npcLabCollapsed,
  onChangeMode,
  npcs,
  onToggleChat,
  onToggleInspector,
  onToggleMiniMap,
  onPatchNpc,
  onRunNpc,
  onToggleNpcLab,
  presenceCount,
  realtimeStatus,
  revision,
  rightCollapsed,
  serverPicker,
  world,
}: EditorTopChromeProps) {
  return (
    <div className="flex items-start justify-between gap-3 transition-[padding] duration-300 ease-out">
      <HiveStatusBadgeGroup
        npcs={npcs}
        presenceCount={presenceCount}
        realtimeStatus={realtimeStatus}
        world={world}
      />
      <div className="flex min-w-0 flex-col items-end gap-2">
        <HiveTopRightToolbar
          chatOpen={chatOpen}
          currentUser={currentUser}
          miniMapCollapsed={miniMapCollapsed}
          mode={mode}
          npcLabCollapsed={npcLabCollapsed}
          onChangeMode={onChangeMode}
          onToggleChat={onToggleChat}
          onToggleInspector={onToggleInspector}
          onToggleMiniMap={onToggleMiniMap}
          onToggleNpcLab={onToggleNpcLab}
          rightCollapsed={rightCollapsed}
          serverPicker={serverPicker}
        />
        <div
          aria-hidden={rightCollapsed}
          className={[
            'w-[min(360px,calc(100vw-2rem))] origin-top-right overflow-hidden rounded-xl border border-border/70 shadow-2xl shadow-foreground/15 transition-[max-height,opacity,transform,visibility] duration-300 ease-out',
            rightCollapsed
              ? 'pointer-events-none invisible max-h-0 translate-x-3 -translate-y-2 scale-95 opacity-0'
              : 'pointer-events-auto visible h-[calc(100dvh-5.75rem)] max-h-none translate-x-0 translate-y-0 scale-100 opacity-100',
          ].join(' ')}
        >
          {inspectorPanel}
        </div>
        <div
          aria-hidden={npcLabCollapsed}
          className={[
            'origin-top-right overflow-hidden transition-[max-height,opacity,transform,visibility] duration-300 ease-out',
            npcLabCollapsed
              ? 'pointer-events-none invisible max-h-0 -translate-y-2 scale-95 opacity-0'
              : 'pointer-events-auto visible max-h-[72vh] translate-y-0 scale-100 opacity-100',
          ].join(' ')}
        >
          <NpcLabPanel
            isRunning={isRunningNpc}
            npcs={npcs}
            onPatchNpc={onPatchNpc}
            onRun={onRunNpc}
            revision={revision}
            world={world}
          />
        </div>
      </div>
    </div>
  );
}
