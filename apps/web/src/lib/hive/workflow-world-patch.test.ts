import { describe, expect, it, vi } from 'vitest';
import { executeHiveWorkflowDefinition } from './workflow-engine';

describe('Hive workflow world patches', () => {
  it('applies world patches from workflow events so runs change the visible world', async () => {
    const createHiveWorldEvent = vi.fn().mockResolvedValue({
      id: 'event-1',
      revision: 9,
    });

    const result = await executeHiveWorkflowDefinition({
      actorUserId: '00000000-0000-4000-8000-000000000001',
      capabilities: {
        createHiveWorldEvent,
        createTradeOffer: vi.fn(),
        createWarehouse: vi.fn(),
        getSnapshot: vi.fn().mockResolvedValue({
          revision: 8,
          server: { id: 'server-1', name: 'Research Garden' },
          world: {
            blocks: [
              {
                id: 'block:0:0:0',
                position: { x: 0, y: 0, z: 0 },
                state: { moisture: 0.7 },
                type: 'grass',
              },
            ],
            objects: [
              {
                id: 'object:tree:0:1:0:seeded',
                position: { x: 0, y: 1, z: 0 },
                type: 'tree',
              },
            ],
          },
        }),
        log: vi.fn(),
        persistNpcDecision: vi.fn(),
        runFarmingAction: vi.fn().mockResolvedValue({
          crop: {
            crop_type: 'turnip',
            id: 'crop-1',
          },
        }),
        runSimulationTick: vi.fn(),
        runTradeAccept: vi.fn(),
        transferInventory: vi.fn(),
        updateNpc: vi.fn(),
      },
      definition: {
        edges: [
          { id: 'trigger-farm', source: 'trigger', target: 'farm' },
          { id: 'farm-world', source: 'farm', target: 'plot' },
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
                action: 'plant',
                cropType: 'turnip',
                position: { x: 2, y: 1, z: 1 },
              },
              label: 'Plant crop',
            },
            id: 'farm',
            position: { x: 220, y: 0 },
            type: 'farming',
          },
          {
            data: {
              config: {
                eventType: 'workflow.farm_plot',
                payload: {
                  cropId: '{{steps.farm.output.crop.id}}',
                  template: 'farm_cycle',
                },
                worldPatch: {
                  blocks: [
                    {
                      position: { x: 2, y: 0, z: 1 },
                      type: 'garden',
                    },
                  ],
                  objects: [
                    {
                      position: { x: 2, y: 1, z: 1 },
                      state: {
                        cropId: '{{steps.farm.output.crop.id}}',
                        cropType: '{{steps.farm.output.crop.crop_type}}',
                        growthStage: 0.2,
                        needsWater: true,
                      },
                      type: 'crop',
                    },
                  ],
                },
              },
              label: 'Stamp farm plot',
            },
            id: 'plot',
            position: { x: 440, y: 0 },
            type: 'world_event',
          },
        ],
        version: 1,
      },
      serverId: 'server-1',
    });

    expect(result.status).toBe('completed');
    expect(createHiveWorldEvent).toHaveBeenCalledWith({
      eventType: 'workflow.farm_plot',
      payload: {
        cropId: 'crop-1',
        template: 'farm_cycle',
      },
      world: {
        blocks: [
          {
            id: 'block:0:0:0',
            position: { x: 0, y: 0, z: 0 },
            state: { moisture: 0.7 },
            type: 'grass',
          },
          {
            id: 'block:2:0:1',
            position: { x: 2, y: 0, z: 1 },
            type: 'garden',
          },
        ],
        objects: [
          {
            id: 'object:tree:0:1:0:seeded',
            position: { x: 0, y: 1, z: 0 },
            type: 'tree',
          },
          {
            id: 'object:crop:2:1:1:workflow',
            position: { x: 2, y: 1, z: 1 },
            state: {
              cropId: 'crop-1',
              cropType: 'turnip',
              growthStage: 0.2,
              needsWater: true,
            },
            type: 'crop',
          },
        ],
      },
    });
  });
});
