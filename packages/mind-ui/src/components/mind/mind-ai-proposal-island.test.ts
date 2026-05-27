import type { MindAiPatchRecord } from '@tuturuuu/types/db';
import type { UIMessage } from 'ai';
import { describe, expect, it } from 'vitest';
import {
  getLatestMindAiProposal,
  getMindAiProposalPartType,
} from './mind-ai-proposal-island';
import {
  getMindToolFailureReason,
  getToolArtifacts,
} from './mind-ai-tool-activity';

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

  it('distinguishes render-only plans from applyable draft proposals', () => {
    expect(getMindAiProposalPartType(renderOnlyMessage())).toBe('plan');
    expect(getMindAiProposalPartType(proposalMessage())).toBe('draft');
  });

  it('surfaces unsuccessful tool outputs as failure reasons', () => {
    const message = failedPatchMessage();

    expect(getMindAiProposalPartType(message)).toBe('plan');
    expect(getMindToolFailureReason(message.parts[1]!)).toContain(
      'Patch draft was not applyable'
    );
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

function renderOnlyMessage(): UIMessage {
  return {
    id: 'message-visual',
    parts: [
      {
        input: {},
        output: { ok: true, spec: visual },
        state: 'output-available',
        toolCallId: PLAN_CALL_ID,
        type: 'tool-render_mind_ui',
      },
    ],
    role: 'assistant',
  } as unknown as UIMessage;
}

function failedPatchMessage(): UIMessage {
  return {
    id: 'message-failed-patch',
    parts: [
      {
        input: {},
        output: { ok: true, spec: visual },
        state: 'output-available',
        toolCallId: PLAN_CALL_ID,
        type: 'tool-render_mind_ui',
      },
      {
        input: {},
        output: {
          ok: false,
          reason: 'Patch draft was not applyable: invalid edge reference',
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
