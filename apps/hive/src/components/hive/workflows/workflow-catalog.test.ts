import { describe, expect, it } from 'vitest';
import { createWorkflowTemplate } from './workflow-catalog';

const label = (key: string) => key;

describe('Hive workflow templates', () => {
  it('builds a farm cycle that persists a crop and stamps it into the visible world', () => {
    const definition = createWorkflowTemplate('farm_cycle', label);
    const farmNode = definition.nodes.find((node) => node.id === 'farm');
    const plotNode = definition.nodes.find((node) => node.id === 'plot');

    expect(definition.edges).toEqual(
      expect.arrayContaining([
        { id: 'context-farm', source: 'context', target: 'farm' },
        { id: 'farm-plot', source: 'farm', target: 'plot' },
        { id: 'plot-log', source: 'plot', target: 'log' },
      ])
    );
    expect(farmNode).toMatchObject({
      data: {
        config: {
          action: 'plant',
          cropType: 'turnip',
          position: { x: 2, y: 1, z: 1 },
        },
      },
      type: 'farming',
    });
    expect(plotNode).toMatchObject({
      data: {
        config: {
          eventType: 'workflow.farm_plot',
          payload: {
            cropId: '{{steps.farm.output.crop.id}}',
            template: 'farm_cycle',
          },
          worldPatch: {
            blocks: expect.arrayContaining([
              {
                position: { x: 2, y: 0, z: 1 },
                type: 'garden',
              },
            ]),
            objects: expect.arrayContaining([
              expect.objectContaining({
                position: { x: 2, y: 1, z: 1 },
                type: 'crop',
              }),
            ]),
          },
        },
      },
      type: 'world_event',
    });
  });
});
