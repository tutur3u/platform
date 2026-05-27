import type { MindAiPatchRecord } from '@tuturuuu/types/db';
import { describe, expect, it } from 'vitest';
import { getPatchFlowPreview } from './mind-ai-patch-draft-card';

describe('Mind AI patch draft preview', () => {
  it('uses board node titles for existing edge endpoints', () => {
    const preview = getPatchFlowPreview(patchRecord(), [
      {
        id: FINANCE_NODE_ID,
        title: 'Finance & Sales',
      },
    ]);

    expect(preview.edges[0]).toMatchObject({
      label: 'contains',
      source: 'Finance & Sales',
      target: 'Operational Cost Tracking',
    });
    expect(preview.edges[0]?.source).not.toContain(FINANCE_NODE_ID.slice(0, 8));
  });
});

function patchRecord(): MindAiPatchRecord {
  return {
    appliedAt: null,
    boardId: 'board-1',
    createdAt: '2026-05-27T00:00:00.000Z',
    createdBy: 'user-1',
    id: 'patch-1',
    patch: {
      operations: [
        {
          id: 'create_cost_tracking',
          kind: 'create_node',
          node: {
            horizon: 'month',
            id: 'cost_tracking',
            nodeType: 'milestone',
            positionX: 320,
            positionY: 240,
            status: 'planned',
            title: 'Operational Cost Tracking',
          },
        },
        {
          edge: {
            edgeType: 'contains',
            id: 'connect_finance_costs',
            sourceNodeId: FINANCE_NODE_ID,
            targetNodeId: 'cost_tracking',
          },
          id: 'connect_finance_costs',
          kind: 'create_edge',
        },
      ],
      summary: 'Expand finance planning.',
    },
    status: 'draft',
    summary: 'Expand finance planning.',
    threadId: 'thread-1',
  };
}

const FINANCE_NODE_ID = '5146f63b-5e02-4c5b-80b5-8b5e1bdcc6f9';
