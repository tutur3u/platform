import type {
  HiveServer,
  HiveServerSettings,
} from '@tuturuuu/internal-api/hive';
import type { ReactNode } from 'react';
import type { HiveNpc, HiveUser, HiveWorldData } from '../../engine/types';
import { HiveAiContextPanel } from './hive-ai-context-panel';
import { HiveTopRightToolbar } from './hive-top-right-toolbar';
import { NpcLabPanel } from './panels/npc-lab-panel';
import type { HiveAiContextState } from './use-hive-ai-context';

type EditorTopChromeProps = {
  aiContext: HiveAiContextState;
  chatOpen: boolean;
  currentUser: HiveUser;
  inspectorPanel: ReactNode;
  isAdmin: boolean;
  isRunningNpc: boolean;
  lastNpcRunStatus?: 'completed' | 'failed' | 'running' | null;
  miniMapCollapsed: boolean;
  mode: 'agents' | 'timeline' | 'workflows' | 'world';
  npcLabCollapsed: boolean;
  onChangeMode: (mode: 'agents' | 'timeline' | 'workflows' | 'world') => void;
  npcs: HiveNpc[];
  onToggleChat: () => void;
  onToggleInspector: () => void;
  onToggleMiniMap: () => void;
  onPatchNpc: (id: string, patch: Partial<HiveNpc>) => void;
  onRunNpc: (
    npcId: string,
    promptMode: 'custom' | 'default' | 'enhanced',
    options?: {
      maxTurns?: number;
      prompt?: string | null;
      targetNpcId?: string | null;
    }
  ) => void;
  onRunNpcInteraction: (input: {
    maxTurns?: number;
    prompt?: string | null;
    sourceNpcId: string;
    targetNpcId: string;
  }) => void;
  onToggleNpcLab: () => void;
  onUpdateServerSettings: (settings: HiveServerSettings) => void;
  revision: number;
  rightCollapsed: boolean;
  selectedNpc: HiveNpc | null;
  selectedServer: HiveServer | null;
  serverPicker: ReactNode;
  world: HiveWorldData;
};

export function EditorTopChrome({
  aiContext,
  chatOpen,
  currentUser,
  inspectorPanel,
  isAdmin,
  isRunningNpc,
  lastNpcRunStatus,
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
  onRunNpcInteraction,
  onToggleNpcLab,
  onUpdateServerSettings,
  revision,
  rightCollapsed,
  selectedNpc,
  selectedServer,
  serverPicker,
  world,
}: EditorTopChromeProps) {
  return (
    <div className="flex items-start justify-end gap-3 transition-[padding] duration-300 ease-out">
      <div className="flex min-w-0 flex-col items-end gap-2">
        <HiveTopRightToolbar
          aiContextPanel={
            <HiveAiContextPanel
              aiContext={aiContext}
              isAdmin={isAdmin}
              onUpdateServerSettings={onUpdateServerSettings}
              selectedServer={selectedServer}
            />
          }
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
            aiContext={aiContext}
            isRunning={isRunningNpc}
            lastRunStatus={lastNpcRunStatus}
            npcs={npcs}
            onPatchNpc={onPatchNpc}
            onRun={onRunNpc}
            onRunInteraction={onRunNpcInteraction}
            revision={revision}
            selectedNpc={selectedNpc}
            world={world}
          />
        </div>
      </div>
    </div>
  );
}
