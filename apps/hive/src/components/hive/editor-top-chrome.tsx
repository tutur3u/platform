import type { HiveNpc, HiveServer, HiveWorldData } from '@/engine/types';
import { NpcLabPanel } from './panels/npc-lab-panel';
import { ServerSummary } from './server-summary';

type EditorTopChromeProps = {
  isRunningNpc: boolean;
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
  npcs,
  onPatchNpc,
  onRunNpc,
  revision,
  server,
  world,
}: EditorTopChromeProps) {
  return (
    <div className="pointer-events-none absolute top-5 right-5 left-5 z-20 flex items-start justify-between gap-4">
      <ServerSummary npcs={npcs} server={server} world={world} />
      <NpcLabPanel
        isRunning={isRunningNpc}
        npcs={npcs}
        onPatchNpc={onPatchNpc}
        onRun={onRunNpc}
        revision={revision}
        world={world}
      />
    </div>
  );
}
