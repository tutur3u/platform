'use client';

import type { HiveNpc, HiveServer, HiveWorldData } from '../../../engine/types';
import { HiveServerMetric } from './hive-server-metric';

type HiveServerStatsProps = {
  labels: {
    blocks: string;
    credits: string;
    npcs: string;
    objects: string;
    online: string;
    revision: string;
  };
  npcs: HiveNpc[];
  presenceCount: number;
  revision: number;
  server?: HiveServer | null;
  world: HiveWorldData;
};

export function HiveServerStats({
  labels,
  npcs,
  presenceCount,
  revision,
  server,
  world,
}: HiveServerStatsProps) {
  return (
    <div className="grid grid-cols-2 gap-2 text-xs">
      <HiveServerMetric label={labels.blocks} value={world.blocks.length} />
      <HiveServerMetric label={labels.objects} value={world.objects.length} />
      <HiveServerMetric label={labels.npcs} value={npcs.length} />
      <HiveServerMetric label={labels.online} value={presenceCount} />
      <HiveServerMetric label={labels.revision} value={revision} />
      <HiveServerMetric
        label={labels.credits}
        value={server?.totalCurrency ?? 0}
      />
    </div>
  );
}
