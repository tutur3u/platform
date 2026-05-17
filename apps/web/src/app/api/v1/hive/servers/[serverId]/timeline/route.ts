import type { HiveNpcRunStatus } from '@tuturuuu/internal-api/hive';
import { type NextRequest, NextResponse } from 'next/server';
import { getHiveSnapshot } from '@/lib/hive/hive-db';
import { listHiveNpcRuns } from '@/lib/hive/npcs';
import {
  mapHiveEvent,
  mapHiveNpcRun,
  requireHiveAccess,
  withHiveRoute,
} from '../../../_shared';

type Params = {
  params: Promise<{
    serverId: string;
  }>;
};

type MappedRun = ReturnType<typeof mapHiveNpcRun> & {
  kind: 'run';
  npcName: string | null;
  targetNpcName: string | null;
};

function aggregateStatus(runs: MappedRun[]): HiveNpcRunStatus {
  if (runs.some((run) => run.status === 'failed')) return 'failed';
  if (runs.some((run) => run.status === 'running')) return 'running';
  if (runs.every((run) => run.status === 'skipped')) return 'skipped';
  return 'completed';
}

function groupRuns(runs: MappedRun[]) {
  const grouped = new Map<string, MappedRun[]>();
  const standalone: MappedRun[] = [];

  for (const run of runs) {
    if (!run.interactionId) {
      standalone.push(run);
      continue;
    }

    grouped.set(run.interactionId, [
      ...(grouped.get(run.interactionId) ?? []),
      run,
    ]);
  }

  const interactions = Array.from(grouped.entries()).map(
    ([interactionId, group]) => {
      const sortedRuns = [...group].sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
      const latestRun = sortedRuns.reduce((latest, run) =>
        new Date(run.createdAt).getTime() > new Date(latest.createdAt).getTime()
          ? run
          : latest
      );
      const firstRun = sortedRuns[0] ?? latestRun;

      return {
        actorUserId: firstRun.actorUserId,
        autonomous: sortedRuns.some((run) => run.autonomous),
        createdAt: latestRun.createdAt,
        creditSource: firstRun.creditSource,
        creditWsId: firstRun.creditWsId,
        creditsDeducted: sortedRuns.reduce(
          (sum, run) => sum + run.creditsDeducted,
          0
        ),
        id: interactionId,
        interactionId,
        kind: 'interaction' as const,
        llmCost: sortedRuns.reduce((sum, run) => sum + run.llmCost, 0),
        llmModel: firstRun.llmModel,
        llmProvider: firstRun.llmProvider,
        npcName: firstRun.npcName,
        runs: sortedRuns,
        status: aggregateStatus(sortedRuns),
        targetNpcName: firstRun.targetNpcName,
        trigger: firstRun.trigger,
      };
    }
  );

  return [...interactions, ...standalone];
}

export async function GET(request: NextRequest, { params }: Params) {
  const { serverId } = await params;

  return withHiveRoute(
    request,
    '/api/v1/hive/servers/[serverId]/timeline',
    async () => {
      const access = await requireHiveAccess(request);
      if (!access.ok) return access.response;

      const [snapshot, runs] = await Promise.all([
        getHiveSnapshot(serverId),
        listHiveNpcRuns({ serverId }),
      ]);
      const events = snapshot.events.map((event) => ({
        ...mapHiveEvent(event),
        kind: 'event' as const,
      }));
      const runItems = runs.map((run) => ({
        ...mapHiveNpcRun(run),
        kind: 'run' as const,
        npcName: run.npc_name ?? null,
        targetNpcName: run.target_npc_name ?? null,
      }));

      const items = [...events, ...groupRuns(runItems)]
        .sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        .slice(0, 180);

      return NextResponse.json({ items });
    }
  );
}
