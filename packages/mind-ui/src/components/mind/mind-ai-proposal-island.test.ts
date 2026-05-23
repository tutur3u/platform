import type { MindAiPatchRecord } from '@tuturuuu/types/db';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import { getLatestMindAiProposal } from './mind-ai-proposal-island';
import { getToolArtifacts } from './mind-ai-tool-activity';

describe('Mind AI proposal consolidation', () => {
  it('combines a generated plan and draft patch into one proposal', () => {
    const message = proposalMessage();

    const proposal = getLatestMindAiProposal([message], [patchRecord()]);

    expect(proposal).toMatchObject({
      id: `visual-${PLAN_CALL_ID}:patch-${PATCH_ID}`,
      patch: expect.objectContaining({ id: PATCH_ID }),
      visual,
    });
  });

  it('renders one artifact row for a plan followed by its draft patch', () => {
    const message = proposalMessage();

    const artifacts = getToolArtifacts(message.parts, [patchRecord()]);

    expect(artifacts).toEqual([
      expect.objectContaining({
        id: `plan-${PLAN_CALL_ID}:patch-${PATCH_ID}`,
        patch: expect.objectContaining({ id: PATCH_ID }),
        title: 'Break down yearly goals',
        type: 'proposal',
        visual,
      }),
    ]);
  });
});

function proposalMessage(): UIMessage {
  return {
    id: 'message-1',
    parts: [
      {
        input: {},
        output: visual,
        state: 'output-available',
        toolCallId: PLAN_CALL_ID,
        type: 'tool-render_mind_ui',
      },
      {
        input: {},
        output: {
          ok: true,
          patch: patchRecord(),
        },
        state: 'output-available',
        toolCallId: 'patch-call',
        type: 'tool-propose_mind_patch',
      },
    ],
    role: 'assistant',
  } as unknown as UIMessage;
}

function patchRecord(): MindAiPatchRecord {
  return {
    appliedAt: null,
    boardId: 'board-1',
    createdAt: '2026-05-23T00:00:00.000Z',
    createdBy: 'user-1',
    id: PATCH_ID,
    patch: {
      operations: [
        {
          id: 'create_q1',
          kind: 'create_node',
          node: {
            horizon: 'quarter',
            id: 'q1',
            nodeType: 'milestone',
            positionX: 0,
            positionY: 0,
            status: 'planned',
            title: 'Q1: Governance',
          },
        },
      ],
      summary: 'Break down yearly goals',
    },
    status: 'draft',
    summary: 'Break down yearly goals',
    threadId: 'thread-1',
  };
}

const PLAN_CALL_ID = 'plan-call';
const PATCH_ID = 'patch-1';
const visual = {
  elements: {
    plan: {
      children: [],
      props: { title: 'Yearly plan' },
      type: 'Card',
    },
  },
  root: 'plan',
};
