import type { HiveNpc, HiveServer, HiveWorldData } from '@/engine/types';
import { NpcLabPanel } from './panels/npc-lab-panel';
import { ServerSummary } from './server-summary';

type EditorTopChromeProps = {
  isRunningNpc: boolean;
  npcLabCollapsed: boolean;
  npcs: HiveNpc[];
  onPatchNpc: (id: string, patch: Partial<HiveNpc>) => void;
  onRunNpc: (
    npcId: string,
    promptMode: 'custom' | 'default' | 'enhanced'
  ) => void;
  revision: number;
  server?: HiveServer | null;
  world: HiveWorldData;
};

export function EditorTopChrome({
  isRunningNpc,
  npcLabCollapsed,
  npcs,
  onPatchNpc,
  onRunNpc,
  revision,
  server,
  world,
}: EditorTopChromeProps) {
  return (
    <div className="flex items-start justify-between gap-4 pr-44">
      <ServerSummary npcs={npcs} server={server} world={world} />
      {npcLabCollapsed ? null : (
        <NpcLabPanel
          isRunning={isRunningNpc}
          npcs={npcs}
          onPatchNpc={onPatchNpc}
          onRun={onRunNpc}
          revision={revision}
          world={world}
        />
      )}
    </div>
  );
}
