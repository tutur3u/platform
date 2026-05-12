import { X } from '@tuturuuu/icons';
import type {
  HiveNpc,
  HiveServer,
  HiveTimeTheme,
  HiveWorldData,
} from '@/engine/types';
import type { HiveRealtimeStatus } from '@/realtime/hive-realtime-client';
import { NpcLabPanel } from './panels/npc-lab-panel';
import { ServerSummary } from './server-summary';

type EditorTopChromeProps = {
  isRunningNpc: boolean;
  autoTimeEnabled: boolean;
  npcLabCollapsed: boolean;
  npcs: HiveNpc[];
  onToggleNpcLab: () => void;
  onPatchNpc: (id: string, patch: Partial<HiveNpc>) => void;
  onRunNpc: (
    npcId: string,
    promptMode: 'custom' | 'default' | 'enhanced'
  ) => void;
  presenceCount: number;
  realtimeStatus: HiveRealtimeStatus;
  revision: number;
  rightCollapsed: boolean;
  server?: HiveServer | null;
  simulatedMinutes: number;
  timeTheme: HiveTimeTheme;
  world: HiveWorldData;
};

export function EditorTopChrome({
  isRunningNpc,
  autoTimeEnabled,
  npcLabCollapsed,
  npcs,
  onToggleNpcLab,
  onPatchNpc,
  onRunNpc,
  presenceCount,
  realtimeStatus,
  revision,
  rightCollapsed,
  server,
  simulatedMinutes,
  timeTheme,
  world,
}: EditorTopChromeProps) {
  return (
    <div
      className={[
        'flex items-start justify-between gap-4',
        rightCollapsed ? '' : 'pr-[384px]',
      ].join(' ')}
    >
      <ServerSummary
        autoTimeEnabled={autoTimeEnabled}
        npcs={npcs}
        presenceCount={presenceCount}
        realtimeStatus={realtimeStatus}
        server={server}
        simulatedMinutes={simulatedMinutes}
        timeTheme={timeTheme}
        world={world}
      />
      {npcLabCollapsed ? null : (
        <div className="pointer-events-auto relative">
          <button
            className="absolute -top-2 -right-2 z-10 inline-flex h-7 w-7 items-center justify-center rounded-full border border-border bg-background text-muted-foreground shadow-lg hover:text-foreground"
            onClick={onToggleNpcLab}
            title="Collapse NPC lab"
            type="button"
          >
            <span className="sr-only">Collapse NPC lab</span>
            <X className="h-3.5 w-3.5" />
          </button>
          <NpcLabPanel
            isRunning={isRunningNpc}
            npcs={npcs}
            onPatchNpc={onPatchNpc}
            onRun={onRunNpc}
            revision={revision}
            world={world}
          />
        </div>
      )}
    </div>
  );
}
