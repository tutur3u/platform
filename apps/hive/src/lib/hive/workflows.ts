import type { Json } from '@tuturuuu/types/db';
import { HiveAiAccessError } from './ai';
import {
  acceptHiveTradeOffer,
  createHiveTradeOffer,
  createHiveWarehouse,
  runHiveFarmingAction,
  transferHiveInventory,
} from './economy';
import {
  createHiveWorldEvent,
  getHiveSnapshot,
  normalizeWorld,
} from './hive-db';
import { runHiveNpcInteraction } from './npc-interactions';
import { getHiveNpc, persistHiveNpcRun, updateHiveNpc } from './npcs';
import {
  ensureHiveResearchSchema,
  resolveHiveResearchSessionId,
} from './research-schema';
import { runHiveSimulationTick } from './simulation';
import {
  executeHiveWorkflowDefinition,
  validateHiveWorkflowDefinition,
} from './workflow-engine';
import {
  finishHiveWorkflowRun,
  getHiveWorkflow,
  insertHiveWorkflowRun,
} from './workflow-store';
import type { HiveWorkflowDefinition } from './workflow-types';

export {
  archiveHiveWorkflow,
  createHiveWorkflow,
  getHiveWorkflow,
  getHiveWorkflowRun,
  listHiveWorkflowRuns,
  listHiveWorkflows,
  updateHiveWorkflow,
} from './workflow-store';

export function validateHiveWorkflowForPersistence(
  definition: HiveWorkflowDefinition
) {
  return validateHiveWorkflowDefinition(definition);
}

async function getWorkflowSnapshot(serverId: string) {
  const snapshot = await getHiveSnapshot(serverId);
  return {
    crops: snapshot.crops,
    economy: {
      inventories: snapshot.inventories,
      totalCurrency: Number(snapshot.server?.total_currency ?? 0),
      warehouses: snapshot.warehouses,
    },
    events: snapshot.events,
    npcs: snapshot.npcs,
    revision: Number(snapshot.state?.op_seq ?? snapshot.state?.revision ?? 0),
    server: snapshot.server,
    world: normalizeWorld(snapshot.state?.world_data as Json),
  };
}

function normalizePositiveInteger(value: unknown, fallback: number, max = 100) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(Math.trunc(parsed), max));
}

function normalizeAgentInteractionPairs(value: unknown) {
  if (!Array.isArray(value)) return [];

  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];

    const pair = item as Record<string, unknown>;
    const sourceNpcId =
      typeof pair.sourceNpcId === 'string' ? pair.sourceNpcId.trim() : '';
    const targetNpcId =
      typeof pair.targetNpcId === 'string' ? pair.targetNpcId.trim() : '';

    if (!sourceNpcId || !targetNpcId || sourceNpcId === targetNpcId) return [];

    return [{ sourceNpcId, targetNpcId }];
  });
}

export async function runHiveWorkflow(input: {
  actorUserId: string;
  input?: Record<string, unknown>;
  isAdmin: boolean;
  researchSessionId?: string | null;
  sbAdmin: import('@tuturuuu/supabase/types').TypedSupabaseClient;
  serverId: string;
  workflowId: string;
}) {
  await ensureHiveResearchSchema();
  const workflow = await getHiveWorkflow(input);
  if (!workflow) return null;
  const researchSessionId = await resolveHiveResearchSessionId({
    researchSessionId: input.researchSessionId,
    serverId: input.serverId,
  });

  const run = await insertHiveWorkflowRun({
    actorUserId: input.actorUserId,
    researchSessionId,
    runInput: input.input ?? {},
    serverId: input.serverId,
    workflowId: input.workflowId,
  });
  if (!run) return null;

  const result = await executeHiveWorkflowDefinition({
    actorUserId: input.actorUserId,
    capabilities: {
      createHiveWorldEvent: async (payload) => {
        const snapshot = await getWorkflowSnapshot(input.serverId);
        const event = await createHiveWorldEvent({
          actorUserId: input.actorUserId,
          eventType:
            typeof payload.eventType === 'string'
              ? payload.eventType
              : 'workflow.event',
          payload: {
            ...(payload.payload &&
            typeof payload.payload === 'object' &&
            !Array.isArray(payload.payload)
              ? (payload.payload as Record<string, unknown>)
              : {}),
            workflowId: input.workflowId,
            workflowRunId: run.id,
            researchSessionId,
          },
          researchSessionId,
          serverId: input.serverId,
          world: normalizeWorld((payload.world as Json) ?? snapshot.world),
        });
        return event;
      },
      createTradeOffer: (payload) =>
        createHiveTradeOffer({
          expiresAt:
            typeof payload.expiresAt === 'string' ? payload.expiresAt : null,
          fromNpcId: String(payload.fromNpcId ?? ''),
          offeredCurrency: Number(payload.offeredCurrency ?? 0),
          offeredItems: (payload.offeredItems ?? []) as Json,
          requestedCurrency: Number(payload.requestedCurrency ?? 0),
          requestedItems: (payload.requestedItems ?? []) as Json,
          serverId: input.serverId,
          toNpcId: typeof payload.toNpcId === 'string' ? payload.toNpcId : null,
        }),
      createWarehouse: (payload) =>
        createHiveWarehouse({
          capacity: Number(payload.capacity ?? 500),
          name: String(payload.name ?? 'Workflow warehouse'),
          position:
            payload.position &&
            typeof payload.position === 'object' &&
            !Array.isArray(payload.position)
              ? (payload.position as { x: number; y: number; z: number })
              : { x: 0, y: 1, z: 0 },
          serverId: input.serverId,
        }),
      getSnapshot: getWorkflowSnapshot,
      runAgentInteractions: async (payload) => {
        const snapshot = await getWorkflowSnapshot(input.serverId);
        const pairs = normalizeAgentInteractionPairs(payload.pairs).slice(
          0,
          normalizePositiveInteger(payload.maxPairs, 24)
        );
        const maxTurns = normalizePositiveInteger(payload.maxTurns, 4, 12);
        const prompt =
          typeof payload.prompt === 'string' && payload.prompt.trim()
            ? payload.prompt.trim()
            : null;
        const model =
          typeof payload.model === 'string' && payload.model.trim()
            ? payload.model.trim()
            : null;
        const creditSource =
          payload.creditSource === 'personal' ||
          payload.creditSource === 'workspace'
            ? payload.creditSource
            : undefined;
        const creditWsId =
          typeof payload.creditWsId === 'string' && payload.creditWsId.trim()
            ? payload.creditWsId.trim()
            : undefined;
        const results = [];

        for (const [index, pair] of pairs.entries()) {
          try {
            const result = await runHiveNpcInteraction({
              actorUserId: input.actorUserId,
              creditSource,
              creditWsId,
              expectedRevision: snapshot.revision,
              maxTurns,
              model,
              prompt,
              promptMode: 'enhanced',
              researchSessionId,
              sbAdmin: input.sbAdmin,
              serverId: input.serverId,
              sourceNpcId: pair.sourceNpcId,
              targetNpcId: pair.targetNpcId,
              trigger: 'workflow',
              world: snapshot.world,
            });

            results.push({
              eventId: result.event?.id ?? null,
              index,
              interactionId: result.interactionId,
              ok: true,
              pair,
              runIds: result.runs.map((run) => run.id),
            });
          } catch (error) {
            const message =
              error instanceof HiveAiAccessError || error instanceof Error
                ? error.message
                : 'Failed to run Hive agent interaction';

            console.warn('Hive workflow agent interaction failed', {
              error: message,
              index,
              serverId: input.serverId,
              sourceNpcId: pair.sourceNpcId,
              targetNpcId: pair.targetNpcId,
              workflowId: input.workflowId,
            });
            results.push({
              error: message,
              index,
              ok: false,
              pair,
              runIds: [],
            });
          }
        }

        const completed = results.filter((result) => result.ok).length;
        return {
          results,
          summary: {
            completed,
            failed: results.length - completed,
            total: results.length,
          },
        };
      },
      persistNpcDecision: async (payload) => {
        const npcId = String(payload.npcId ?? '');
        if (!npcId) throw new Error('npc_decision nodes require npcId.');

        const npc = await getHiveNpc({ npcId, serverId: input.serverId });
        if (!npc) throw new Error('NPC not found.');

        const snapshot = await getWorkflowSnapshot(input.serverId);
        const decision = {
          action: { type: 'work' },
          intent: String(
            payload.intent ?? `Run workflow action for ${npc.name}`
          ),
          memoryWrites: [],
          rationale: `Manual workflow ${workflow.name} ran for ${npc.name}.`,
          spokenText: String(payload.spokenText ?? ''),
        };
        const npcRun = await persistHiveNpcRun({
          actorUserId: input.actorUserId,
          decision,
          inputContext: {
            workflowId: input.workflowId,
            workflowRunId: run.id,
          },
          llmCost: 0,
          llmModel: npc.model,
          llmProvider: 'workflow',
          npcId,
          promptMode: 'workflow',
          researchSessionId,
          serverId: input.serverId,
        });

        await createHiveWorldEvent({
          actorUserId: input.actorUserId,
          eventType: 'npc.decision',
          payload: {
            decision,
            npcId,
            researchSessionId,
            runId: npcRun?.id,
            workflowId: input.workflowId,
            workflowRunId: run.id,
          },
          researchSessionId,
          serverId: input.serverId,
          world: snapshot.world,
        });

        return { decision, run: npcRun };
      },
      runFarmingAction: (payload) =>
        runHiveFarmingAction({
          action:
            payload.action === 'water' || payload.action === 'harvest'
              ? payload.action
              : 'plant',
          actorUserId: input.actorUserId,
          cropId:
            typeof payload.cropId === 'string' ? payload.cropId : undefined,
          cropType:
            typeof payload.cropType === 'string' ? payload.cropType : undefined,
          npcId: typeof payload.npcId === 'string' ? payload.npcId : undefined,
          position:
            payload.position &&
            typeof payload.position === 'object' &&
            !Array.isArray(payload.position)
              ? (payload.position as { x: number; y: number; z: number })
              : undefined,
          serverId: input.serverId,
        }),
      runSimulationTick: () =>
        runHiveSimulationTick({
          force: true,
          researchSessionId,
          serverId: input.serverId,
        }),
      runTradeAccept: (payload) =>
        acceptHiveTradeOffer({
          acceptingNpcId: String(payload.acceptingNpcId ?? ''),
          serverId: input.serverId,
          tradeId: String(payload.tradeId ?? ''),
        }),
      transferInventory: (payload) =>
        transferHiveInventory({
          fromOwnerId: String(payload.fromOwnerId ?? ''),
          fromOwnerType:
            payload.fromOwnerType === 'warehouse' ? 'warehouse' : 'npc',
          itemType: String(payload.itemType ?? ''),
          quantity: Number(payload.quantity ?? 1),
          serverId: input.serverId,
          toOwnerId: String(payload.toOwnerId ?? ''),
          toOwnerType:
            payload.toOwnerType === 'warehouse' ? 'warehouse' : 'npc',
        }),
      updateNpc: (npcId, patch) =>
        updateHiveNpc({
          npcId,
          patch,
          serverId: input.serverId,
        }),
    },
    definition: workflow.definition,
    input: input.input,
    serverId: input.serverId,
  });

  return finishHiveWorkflowRun({
    error: result.error ?? null,
    output: result.output,
    runId: run.id,
    status: result.status,
    trace: result.trace,
  });
}
