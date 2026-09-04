import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  ensureWorkflowSchema: vi.fn(),
  getHiveSql: vi.fn(),
  validateWorkflow: vi.fn(),
}));

vi.mock('./hive-db', () => ({
  asHiveJson: (value: unknown) => value,
  getHiveSql: mocks.getHiveSql,
}));
vi.mock('./workflow-store', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./workflow-store')>();
  return {
    ...actual,
    ensureHiveWorkflowSchema: mocks.ensureWorkflowSchema,
  };
});
vi.mock('./workflows', () => ({
  validateHiveWorkflowForPersistence: mocks.validateWorkflow,
}));

import type { HiveMindSimulationPlan } from './mind-simulation-blueprint';
import {
  HiveMindMaterializationValidationError,
  materializeHiveMindSimulation,
} from './mind-simulation-materializer';

type State = {
  ledger: number;
  needs: number;
  npcs: number;
  wallets: number;
  workflows: number;
};

const emptyState = (): State => ({
  ledger: 0,
  needs: 0,
  npcs: 0,
  wallets: 0,
  workflows: 0,
});

function createTransactionalSql(options?: {
  failNpcNumber?: number;
  missingNpcNumber?: number;
  missingWorkflow?: boolean;
  workflowError?: boolean;
}) {
  let committed = emptyState();
  let npcAttempt = 0;
  const order: string[] = [];

  const sql: any = vi.fn();
  sql.begin = vi.fn(async (handler: (tx: unknown) => Promise<unknown>) => {
    order.push('begin');
    const pending = { ...committed };
    const tx: any = async (
      strings: TemplateStringsArray,
      ..._values: unknown[]
    ) => {
      const query = strings.join(' ');
      if (query.includes('insert into hive_npcs')) {
        npcAttempt += 1;
        if (npcAttempt === options?.failNpcNumber) {
          throw new Error('npc insert fault');
        }
        if (npcAttempt === options?.missingNpcNumber) return [];
        pending.npcs += 1;
        return [
          {
            archived_at: null,
            backstory: '',
            backstory_enabled: true,
            created_at: '2026-08-10T00:00:00.000Z',
            created_by: 'user-1',
            custom_prompt_enabled: true,
            id: `npc-${npcAttempt}`,
            memory_enabled: true,
            model: 'model',
            name: `NPC ${npcAttempt}`,
            position: {},
            role: 'agent',
            server_id: 'server-1',
            settings: {},
            status: 'active',
            system_prompt: '',
          },
        ];
      }
      if (query.includes('insert into hive_npc_wallets')) {
        pending.wallets += 1;
        return [];
      }
      if (query.includes('insert into hive_npc_needs')) {
        pending.needs += 1;
        return [];
      }
      if (query.includes('insert into hive_ledger_entries')) {
        pending.ledger += 1;
        return [];
      }
      if (query.includes('insert into hive_workflows')) {
        if (options?.workflowError) throw new Error('workflow insert fault');
        if (options?.missingWorkflow) return [];
        pending.workflows += 1;
        return [
          {
            archived_at: null,
            created_at: '2026-08-10T00:00:00.000Z',
            created_by: 'user-1',
            definition: { edges: [], nodes: [], version: 1 },
            description: null,
            enabled: true,
            id: 'workflow-1',
            name: 'Mind simulation',
            server_id: 'server-1',
            updated_at: '2026-08-10T00:00:00.000Z',
            updated_by: 'user-1',
            version: 1,
          },
        ];
      }
      return [];
    };
    tx.json = (value: unknown) => value;

    const result = await handler(tx);
    committed = pending;
    return result;
  });

  return {
    get committed() {
      return committed;
    },
    order,
    sql,
  };
}

const snapshot = {
  board: { id: 'board-1', title: 'Atomic board' },
  edges: [],
  nodes: [],
} as never;

function plan(agentCount = 2): HiveMindSimulationPlan {
  const agents = Array.from({ length: agentCount }, (_, index) => ({
    backstory: '',
    customPromptEnabled: true,
    memoryEnabled: true,
    model: 'model',
    name: `Agent ${index + 1}`,
    position: { x: index, y: 1, z: 0 },
    role: 'agent',
    settings: {},
    sourceNodeId: `node-${index + 1}`,
    systemPrompt: '',
  }));
  return {
    agents,
    pairs:
      agentCount >= 2
        ? [{ sourceNodeId: 'node-1', targetNodeId: 'node-2' }]
        : [],
  };
}

async function materialize(simulationPlan = plan()) {
  return materializeHiveMindSimulation({
    actorUserId: 'user-1',
    plan: simulationPlan,
    serverId: 'server-1',
    snapshot,
  });
}

describe('materializeHiveMindSimulation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.ensureWorkflowSchema.mockResolvedValue(undefined);
    mocks.validateWorkflow.mockReturnValue({ errors: [], ok: true });
  });

  it('commits all NPC bundles and exactly one workflow in one transaction', async () => {
    const database = createTransactionalSql();
    mocks.getHiveSql.mockReturnValue(database.sql);
    mocks.ensureWorkflowSchema.mockImplementation(async () => {
      database.order.push('schema');
    });

    const result = await materialize();

    expect(result.agents).toHaveLength(2);
    expect(result.pairs).toHaveLength(1);
    expect(result.workflow.id).toBe('workflow-1');
    expect(database.committed).toEqual({
      ledger: 2,
      needs: 2,
      npcs: 2,
      wallets: 2,
      workflows: 1,
    });
    expect(database.order).toEqual(['schema', 'begin']);
    expect(database.sql.begin).toHaveBeenCalledOnce();
  });

  it('rolls back a second NPC bundle fault and retry creates one graph', async () => {
    const failedDatabase = createTransactionalSql({ failNpcNumber: 2 });
    mocks.getHiveSql.mockReturnValue(failedDatabase.sql);

    await expect(materialize()).rejects.toThrow('npc insert fault');
    expect(failedDatabase.committed).toEqual(emptyState());

    const retryDatabase = createTransactionalSql();
    mocks.getHiveSql.mockReturnValue(retryDatabase.sql);
    await materialize();

    expect(retryDatabase.committed).toEqual({
      ledger: 2,
      needs: 2,
      npcs: 2,
      wallets: 2,
      workflows: 1,
    });
  });

  it('rolls back when fewer than two NPCs can be materialized', async () => {
    const database = createTransactionalSql({ missingNpcNumber: 2 });
    mocks.getHiveSql.mockReturnValue(database.sql);

    await expect(materialize()).rejects.toThrow(
      'Failed to insert Hive NPC bundle'
    );
    expect(database.committed).toEqual(emptyState());
  });

  it('rolls back an invalid undersized materialization plan', async () => {
    const database = createTransactionalSql();
    mocks.getHiveSql.mockReturnValue(database.sql);

    await expect(materialize(plan(1))).rejects.toBeInstanceOf(
      HiveMindMaterializationValidationError
    );
    expect(database.committed).toEqual(emptyState());
  });

  it('rolls back every NPC side effect on workflow validation failure', async () => {
    const database = createTransactionalSql();
    mocks.getHiveSql.mockReturnValue(database.sql);
    mocks.validateWorkflow.mockReturnValue({
      errors: ['Invalid workflow'],
      ok: false,
    });

    await expect(materialize()).rejects.toThrow('Invalid workflow');
    expect(database.committed).toEqual(emptyState());
  });

  it.each([
    ['missing row', { missingWorkflow: true }],
    ['insert fault', { workflowError: true }],
  ])(
    'rolls back every NPC side effect on workflow %s',
    async (_label, options) => {
      const database = createTransactionalSql(options);
      mocks.getHiveSql.mockReturnValue(database.sql);

      await expect(materialize()).rejects.toThrow();
      expect(database.committed).toEqual(emptyState());
    }
  );
});
