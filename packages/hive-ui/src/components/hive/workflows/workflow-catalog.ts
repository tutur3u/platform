import {
  Bot,
  GitBranch,
  MessageSquareText,
  PackagePlus,
  Play,
  Repeat2,
  Shuffle,
  Sprout,
  SquarePen,
  Warehouse,
  Waypoints,
  Workflow,
} from '@tuturuuu/icons';
import type {
  HiveJsonObject,
  HiveWorkflowDefinition,
  HiveWorkflowNodeType,
} from '@tuturuuu/internal-api/hive';
import type { ComponentType } from 'react';

export type WorkflowCatalogItem = {
  defaultConfig: HiveJsonObject;
  icon: ComponentType<{ className?: string }>;
  labelKey: string;
  type: HiveWorkflowNodeType;
};

export const workflowCatalog: WorkflowCatalogItem[] = [
  {
    defaultConfig: {},
    icon: Play,
    labelKey: 'manual_trigger',
    type: 'manual_trigger',
  },
  { defaultConfig: {}, icon: Waypoints, labelKey: 'context', type: 'context' },
  {
    defaultConfig: { left: '{{input.mode}}', operator: 'equals', right: 'run' },
    icon: GitBranch,
    labelKey: 'condition',
    type: 'condition',
  },
  {
    defaultConfig: { value: { note: '{{steps.context.output.revision}}' } },
    icon: Shuffle,
    labelKey: 'transform',
    type: 'transform',
  },
  {
    defaultConfig: {
      message: 'Workflow reached {{steps.context.output.server.name}}',
    },
    icon: MessageSquareText,
    labelKey: 'log',
    type: 'log',
  },
  {
    defaultConfig: {},
    icon: Repeat2,
    labelKey: 'simulation_tick',
    type: 'simulation_tick',
  },
  {
    defaultConfig: {
      maxPairs: 8,
      maxTurns: 4,
      pairs: [],
      prompt: 'Coordinate agents around the current workflow scenario.',
    },
    icon: Bot,
    labelKey: 'agent_interaction',
    type: 'agent_interaction',
  },
  {
    defaultConfig: { npcId: '', spokenText: 'Workflow instruction received.' },
    icon: Bot,
    labelKey: 'npc_decision',
    type: 'npc_decision',
  },
  {
    defaultConfig: { npcId: '', patch: { role: 'resident' } },
    icon: SquarePen,
    labelKey: 'update_npc',
    type: 'update_npc',
  },
  {
    defaultConfig: {
      eventType: 'workflow.event',
      payload: { source: 'workflow' },
      worldPatch: {
        objects: [
          {
            id: 'workflow:event-marker:0:1:0',
            position: { x: 0, y: 1, z: 0 },
            state: { label: 'Workflow event' },
            type: 'marker',
          },
        ],
      },
    },
    icon: Workflow,
    labelKey: 'world_event',
    type: 'world_event',
  },
  {
    defaultConfig: {
      action: 'plant',
      cropType: 'turnip',
      position: { x: 0, y: 1, z: 0 },
    },
    icon: Sprout,
    labelKey: 'farming',
    type: 'farming',
  },
  {
    defaultConfig: {
      action: 'create',
      capacity: 500,
      name: 'Workflow Warehouse',
      position: { x: 0, y: 1, z: 0 },
    },
    icon: Warehouse,
    labelKey: 'warehouse',
    type: 'warehouse',
  },
  {
    defaultConfig: {
      action: 'create',
      fromNpcId: '',
      offeredCurrency: 0,
      requestedCurrency: 0,
    },
    icon: PackagePlus,
    labelKey: 'trade',
    type: 'trade',
  },
];

export type WorkflowTemplateKey =
  | 'agent_roundtable'
  | 'farm_cycle'
  | 'market_trade'
  | 'npc_daily'
  | 'simulation_tick'
  | 'world_cleanup';

export function createWorkflowTemplate(
  key: WorkflowTemplateKey,
  label: (key: string) => string
): HiveWorkflowDefinition {
  const manual = {
    data: { label: label('nodes.manual_trigger') },
    id: 'trigger',
    position: { x: 0, y: 80 },
    type: 'manual_trigger' as const,
  };
  const context = {
    data: { label: label('nodes.context') },
    id: 'context',
    position: { x: 250, y: 80 },
    type: 'context' as const,
  };

  if (key === 'simulation_tick') {
    return {
      edges: [
        { id: 'trigger-context', source: 'trigger', target: 'context' },
        { id: 'context-tick', source: 'context', target: 'tick' },
      ],
      nodes: [
        manual,
        context,
        {
          data: { config: {}, label: label('nodes.simulation_tick') },
          id: 'tick',
          position: { x: 520, y: 80 },
          type: 'simulation_tick',
        },
      ],
      version: 1,
    };
  }

  if (key === 'farm_cycle') {
    return {
      edges: [
        { id: 'trigger-context', source: 'trigger', target: 'context' },
        { id: 'context-farm', source: 'context', target: 'farm' },
        { id: 'farm-plot', source: 'farm', target: 'plot' },
        { id: 'plot-log', source: 'plot', target: 'log' },
      ],
      nodes: [
        manual,
        context,
        {
          data: {
            config: {
              action: 'plant',
              cropType: 'turnip',
              position: { x: 2, y: 1, z: 1 },
            },
            label: label('nodes.farming'),
          },
          id: 'farm',
          position: { x: 520, y: 40 },
          type: 'farming',
        },
        {
          data: {
            config: {
              eventType: 'workflow.farm_plot',
              payload: {
                cropId: '{{steps.farm.output.crop.id}}',
                cropType: '{{steps.farm.output.crop.crop_type}}',
                template: 'farm_cycle',
              },
              worldPatch: {
                blocks: [
                  {
                    position: { x: 1, y: 0, z: 1 },
                    type: 'garden',
                  },
                  {
                    position: { x: 2, y: 0, z: 1 },
                    type: 'garden',
                  },
                  {
                    position: { x: 3, y: 0, z: 1 },
                    type: 'garden',
                  },
                ],
                objects: [
                  {
                    id: 'workflow:farm-cycle:crop:2:1:1',
                    position: { x: 2, y: 1, z: 1 },
                    state: {
                      cropId: '{{steps.farm.output.crop.id}}',
                      cropType: '{{steps.farm.output.crop.crop_type}}',
                      growthStage: 0.35,
                      needsWater: true,
                    },
                    type: 'crop',
                  },
                ],
              },
            },
            label: label('nodes.world_event'),
          },
          id: 'plot',
          position: { x: 790, y: 40 },
          type: 'world_event',
        },
        {
          data: {
            config: {
              message:
                'Farm cycle planted {{steps.farm.output.crop.crop_type}} and updated the world.',
            },
            label: label('nodes.log'),
          },
          id: 'log',
          position: { x: 1060, y: 40 },
          type: 'log',
        },
      ],
      version: 1,
    };
  }

  if (key === 'world_cleanup') {
    return {
      edges: [
        { id: 'trigger-context', source: 'trigger', target: 'context' },
        { id: 'context-cleanup', source: 'context', target: 'cleanup' },
      ],
      nodes: [
        manual,
        context,
        {
          data: {
            config: {
              eventType: 'workflow.cleanup',
              payload: { template: key },
              worldPatch: {
                removeBlockIds: ['block:1:0:1', 'block:2:0:1', 'block:3:0:1'],
                removeObjectIds: ['workflow:farm-cycle:crop:2:1:1'],
              },
            },
            label: label('nodes.world_event'),
          },
          id: 'cleanup',
          position: { x: 520, y: 80 },
          type: 'world_event',
        },
      ],
      version: 1,
    };
  }

  if (key === 'agent_roundtable') {
    return {
      edges: [
        { id: 'trigger-context', source: 'trigger', target: 'context' },
        { id: 'context-agents', source: 'context', target: 'agents' },
        { id: 'agents-log', source: 'agents', target: 'log' },
      ],
      nodes: [
        manual,
        context,
        {
          data: {
            config: {
              maxPairs: 8,
              maxTurns: 4,
              pairs: [],
              prompt:
                'Run a compact multi-agent roundtable for this Hive scenario.',
            },
            label: label('nodes.agent_interaction'),
          },
          id: 'agents',
          position: { x: 520, y: 80 },
          type: 'agent_interaction',
        },
        {
          data: {
            config: {
              message:
                'Agent roundtable completed {{steps.agents.output.summary.completed}} of {{steps.agents.output.summary.total}} pairs.',
            },
            label: label('nodes.log'),
          },
          id: 'log',
          position: { x: 790, y: 80 },
          type: 'log',
        },
      ],
      version: 1,
    };
  }

  const actionType = key === 'npc_daily' ? 'npc_decision' : 'world_event';
  return {
    edges: [
      { id: 'trigger-context', source: 'trigger', target: 'context' },
      { id: 'context-action', source: 'context', target: 'action' },
    ],
    nodes: [
      manual,
      context,
      {
        data: {
          config:
            actionType === 'npc_decision'
              ? { npcId: '', spokenText: 'Starting daily routine.' }
              : {
                  eventType: 'workflow.trade',
                  payload: { template: key },
                },
          label: label(`nodes.${actionType}`),
        },
        id: 'action',
        position: { x: 520, y: 80 },
        type: actionType,
      },
    ],
    version: 1,
  };
}
