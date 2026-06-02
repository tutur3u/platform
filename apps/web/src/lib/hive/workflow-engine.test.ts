import { describe, expect, it, vi } from 'vitest';
import {
  executeHiveWorkflowDefinition,
  resolveHiveWorkflowValue,
  validateHiveWorkflowDefinition,
} from './workflow-engine';
import type { HiveWorkflowDefinition } from './workflow-types';

const baseDefinition: HiveWorkflowDefinition = {
  edges: [
    {
      id: 'trigger-context',
      source: 'trigger',
      target: 'context',
    },
    {
      id: 'context-log',
      source: 'context',
      target: 'log',
    },
  ],
  nodes: [
    {
      data: { label: 'Manual run' },
      id: 'trigger',
      position: { x: 0, y: 0 },
      type: 'manual_trigger',
    },
    {
      data: { label: 'Read world' },
      id: 'context',
      position: { x: 240, y: 0 },
      type: 'context',
    },
    {
      data: {
        config: {
          message:
            'Revision {{steps.context.output.revision}} on {{steps.context.output.server.name}}',
        },
        label: 'Log summary',
      },
      id: 'log',
      position: { x: 480, y: 0 },
      type: 'log',
    },
  ],
  version: 1,
};

describe('Hive workflow graph validation', () => {
  it('accepts a manual trigger graph and rejects cycles', () => {
    expect(validateHiveWorkflowDefinition(baseDefinition)).toEqual({
      errors: [],
      ok: true,
    });

    expect(
      validateHiveWorkflowDefinition({
        ...baseDefinition,
        edges: [
          ...baseDefinition.edges,
          { id: 'cycle', source: 'log', target: 'trigger' },
        ],
      })
    ).toEqual({
      errors: ['Workflow graphs cannot contain cycles.'],
      ok: false,
    });
  });

  it('rejects graph definitions that can run away', () => {
    const nodes = Array.from({ length: 81 }, (_, index) => ({
      data: { label: `Node ${index}` },
      id: index === 0 ? 'trigger' : `node-${index}`,
      position: { x: index * 20, y: 0 },
      type: index === 0 ? 'manual_trigger' : 'log',
    })) as HiveWorkflowDefinition['nodes'];

    expect(
      validateHiveWorkflowDefinition({
        edges: [],
        nodes,
        version: 1,
      })
    ).toEqual({
      errors: ['Hive workflows are limited to 80 nodes.'],
      ok: false,
    });
  });
});

describe('Hive workflow expression resolution', () => {
  it('resolves restricted step references without evaluating JavaScript', () => {
    const resolved = resolveHiveWorkflowValue(
      {
        message: 'Hello {{steps.context.output.server.name}}',
        nested: ['{{input.reason}}', '{{steps.context.output.revision}}'],
        unsafe: '{{process.env.SECRET}}',
      },
      {
        input: { reason: 'manual test' },
        steps: {
          context: {
            output: {
              revision: 12,
              server: { name: 'Research Garden' },
            },
          },
        },
      }
    );

    expect(resolved).toEqual({
      message: 'Hello Research Garden',
      nested: ['manual test', 12],
      unsafe: '',
    });
  });
});

describe('Hive workflow execution', () => {
  it('runs nodes in graph order and records a trace', async () => {
    const log = vi.fn();
    const result = await executeHiveWorkflowDefinition({
      actorUserId: '00000000-0000-4000-8000-000000000001',
      capabilities: {
        createHiveWorldEvent: vi.fn(),
        createTradeOffer: vi.fn(),
        createWarehouse: vi.fn(),
        getSnapshot: vi.fn().mockResolvedValue({
          events: [],
          npcs: [],
          revision: 7,
          server: { id: 'server-1', name: 'Research Garden' },
          world: { blocks: [], objects: [] },
        }),
        log,
        persistNpcDecision: vi.fn(),
        runAgentInteractions: vi.fn(),
        runFarmingAction: vi.fn(),
        runSimulationTick: vi.fn(),
        runTradeAccept: vi.fn(),
        transferInventory: vi.fn(),
        updateNpc: vi.fn(),
      },
      definition: baseDefinition,
      input: { reason: 'operator run' },
      serverId: 'server-1',
    });

    expect(result.status).toBe('completed');
    expect(result.trace.map((step) => step.nodeId)).toEqual([
      'trigger',
      'context',
      'log',
    ]);
    expect(result.trace.at(-1)?.output).toEqual({
      message: 'Revision 7 on Research Garden',
    });
    expect(log).toHaveBeenCalledWith('Revision 7 on Research Garden');
  });

  it('routes condition branches by edge handle', async () => {
    const definition: HiveWorkflowDefinition = {
      edges: [
        { id: 'trigger-condition', source: 'trigger', target: 'condition' },
        {
          id: 'condition-true',
          source: 'condition',
          sourceHandle: 'true',
          target: 'true-log',
        },
        {
          id: 'condition-false',
          source: 'condition',
          sourceHandle: 'false',
          target: 'false-log',
        },
      ],
      nodes: [
        {
          data: { label: 'Manual run' },
          id: 'trigger',
          position: { x: 0, y: 0 },
          type: 'manual_trigger',
        },
        {
          data: {
            config: {
              left: '{{input.mode}}',
              operator: 'equals',
              right: 'approve',
            },
            label: 'Mode check',
          },
          id: 'condition',
          position: { x: 220, y: 0 },
          type: 'condition',
        },
        {
          data: { config: { message: 'approved' }, label: 'Approved' },
          id: 'true-log',
          position: { x: 460, y: -80 },
          type: 'log',
        },
        {
          data: { config: { message: 'rejected' }, label: 'Rejected' },
          id: 'false-log',
          position: { x: 460, y: 80 },
          type: 'log',
        },
      ],
      version: 1,
    };

    const result = await executeHiveWorkflowDefinition({
      actorUserId: '00000000-0000-4000-8000-000000000001',
      capabilities: {
        createHiveWorldEvent: vi.fn(),
        createTradeOffer: vi.fn(),
        createWarehouse: vi.fn(),
        getSnapshot: vi.fn(),
        log: vi.fn(),
        persistNpcDecision: vi.fn(),
        runAgentInteractions: vi.fn(),
        runFarmingAction: vi.fn(),
        runSimulationTick: vi.fn(),
        runTradeAccept: vi.fn(),
        transferInventory: vi.fn(),
        updateNpc: vi.fn(),
      },
      definition,
      input: { mode: 'approve' },
      serverId: 'server-1',
    });

    expect(result.trace.map((step) => step.nodeId)).toEqual([
      'trigger',
      'condition',
      'true-log',
    ]);
  });

  it('runs agent interaction nodes through workflow capabilities', async () => {
    const runAgentInteractions = vi.fn().mockResolvedValue({
      summary: { completed: 1, failed: 0, total: 1 },
    });
    const definition: HiveWorkflowDefinition = {
      edges: [{ id: 'trigger-agents', source: 'trigger', target: 'agents' }],
      nodes: [
        {
          data: { label: 'Manual run' },
          id: 'trigger',
          position: { x: 0, y: 0 },
          type: 'manual_trigger',
        },
        {
          data: {
            config: {
              pairs: [
                {
                  sourceNpcId: 'npc-1',
                  targetNpcId: 'npc-2',
                },
              ],
              prompt: 'Debate the Mind board.',
            },
            label: 'Agent interaction',
          },
          id: 'agents',
          position: { x: 220, y: 0 },
          type: 'agent_interaction',
        },
      ],
      version: 1,
    };

    const result = await executeHiveWorkflowDefinition({
      actorUserId: '00000000-0000-4000-8000-000000000001',
      capabilities: {
        createHiveWorldEvent: vi.fn(),
        createTradeOffer: vi.fn(),
        createWarehouse: vi.fn(),
        getSnapshot: vi.fn(),
        log: vi.fn(),
        persistNpcDecision: vi.fn(),
        runAgentInteractions,
        runFarmingAction: vi.fn(),
        runSimulationTick: vi.fn(),
        runTradeAccept: vi.fn(),
        transferInventory: vi.fn(),
        updateNpc: vi.fn(),
      },
      definition,
      serverId: 'server-1',
    });

    expect(result.status).toBe('completed');
    expect(runAgentInteractions).toHaveBeenCalledWith({
      pairs: [{ sourceNpcId: 'npc-1', targetNpcId: 'npc-2' }],
      prompt: 'Debate the Mind board.',
    });
    expect(result.trace.at(-1)?.output).toEqual({
      summary: { completed: 1, failed: 0, total: 1 },
    });
  });

  it('validates resolved warehouse transfer configs before mutating inventory', async () => {
    const transferInventory = vi.fn();
    const result = await executeHiveWorkflowDefinition({
      actorUserId: '00000000-0000-4000-8000-000000000001',
      capabilities: {
        createHiveWorldEvent: vi.fn(),
        createTradeOffer: vi.fn(),
        createWarehouse: vi.fn(),
        getSnapshot: vi.fn(),
        log: vi.fn(),
        persistNpcDecision: vi.fn(),
        runAgentInteractions: vi.fn(),
        runFarmingAction: vi.fn(),
        runSimulationTick: vi.fn(),
        runTradeAccept: vi.fn(),
        transferInventory,
        updateNpc: vi.fn(),
      },
      definition: {
        edges: [
          { id: 'trigger-transfer', source: 'trigger', target: 'transfer' },
        ],
        nodes: [
          {
            data: { label: 'Manual run' },
            id: 'trigger',
            position: { x: 0, y: 0 },
            type: 'manual_trigger',
          },
          {
            data: {
              config: {
                action: 'transfer',
                fromOwnerId: '00000000-0000-4000-8000-000000000011',
                fromOwnerType: 'warehouse',
                itemType: 'turnip',
                quantity: '{{input.quantity}}',
                toOwnerId: '00000000-0000-4000-8000-000000000012',
                toOwnerType: 'npc',
              },
              label: 'Transfer inventory',
            },
            id: 'transfer',
            position: { x: 220, y: 0 },
            type: 'warehouse',
          },
        ],
        version: 1,
      },
      input: { quantity: -5 },
      serverId: 'server-1',
    });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Invalid Hive workflow warehouse config');
    expect(result.error).toContain('quantity');
    expect(transferInventory).not.toHaveBeenCalled();
  });

  it('rejects invalid workflow world patches before creating events', async () => {
    const createHiveWorldEvent = vi.fn();
    const result = await executeHiveWorkflowDefinition({
      actorUserId: '00000000-0000-4000-8000-000000000001',
      capabilities: {
        createHiveWorldEvent,
        createTradeOffer: vi.fn(),
        createWarehouse: vi.fn(),
        getSnapshot: vi.fn(),
        log: vi.fn(),
        persistNpcDecision: vi.fn(),
        runAgentInteractions: vi.fn(),
        runFarmingAction: vi.fn(),
        runSimulationTick: vi.fn(),
        runTradeAccept: vi.fn(),
        transferInventory: vi.fn(),
        updateNpc: vi.fn(),
      },
      definition: {
        edges: [{ id: 'trigger-event', source: 'trigger', target: 'event' }],
        nodes: [
          {
            data: { label: 'Manual run' },
            id: 'trigger',
            position: { x: 0, y: 0 },
            type: 'manual_trigger',
          },
          {
            data: {
              config: {
                eventType: 'workflow.bad_patch',
                worldPatch: {
                  objects: [
                    {
                      position: { x: '{{input.x}}', y: 1, z: 1 },
                      type: 'crop',
                    },
                  ],
                },
              },
              label: 'Patch world',
            },
            id: 'event',
            position: { x: 220, y: 0 },
            type: 'world_event',
          },
        ],
        version: 1,
      },
      input: { x: '2' },
      serverId: 'server-1',
    });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('Invalid Hive workflow world_event config');
    expect(result.error).toContain('worldPatch.objects.0.position.x');
    expect(createHiveWorldEvent).not.toHaveBeenCalled();
  });

  it('records failed node traces and stops execution', async () => {
    const result = await executeHiveWorkflowDefinition({
      actorUserId: '00000000-0000-4000-8000-000000000001',
      capabilities: {
        createHiveWorldEvent: vi.fn(),
        createTradeOffer: vi.fn(),
        createWarehouse: vi.fn(),
        getSnapshot: vi.fn(),
        log: vi.fn(),
        persistNpcDecision: vi.fn(),
        runAgentInteractions: vi.fn(),
        runFarmingAction: vi.fn(),
        runSimulationTick: vi.fn(),
        runTradeAccept: vi.fn(),
        transferInventory: vi.fn(),
        updateNpc: vi.fn().mockRejectedValue(new Error('NPC not found.')),
      },
      definition: {
        edges: [
          { id: 'trigger-update', source: 'trigger', target: 'update-npc' },
        ],
        nodes: [
          {
            data: { label: 'Manual run' },
            id: 'trigger',
            position: { x: 0, y: 0 },
            type: 'manual_trigger',
          },
          {
            data: {
              config: {
                npcId: '00000000-0000-4000-8000-000000000021',
                patch: { role: 'runner' },
              },
              label: 'Update NPC',
            },
            id: 'update-npc',
            position: { x: 220, y: 0 },
            type: 'update_npc',
          },
        ],
        version: 1,
      },
      serverId: 'server-1',
    });

    expect(result.status).toBe('failed');
    expect(result.error).toBe('NPC not found.');
    expect(result.trace.at(-1)).toEqual(
      expect.objectContaining({
        error: 'NPC not found.',
        nodeId: 'update-npc',
        status: 'failed',
      })
    );
  });
});
