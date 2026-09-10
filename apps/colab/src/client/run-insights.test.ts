import type { Run, TeamLimits } from '@tuturuuu/multiplayer';
import { describe, expect, it } from 'vitest';
import { runInsights } from './run-insights';

const limits: TeamLimits = {
  aiCallLimit: 100,
  agentTurnLimit: 12,
  toolCallLimit: 10,
};

function run(overrides: Partial<Run> = {}): Run {
  return {
    id: 'run-1',
    at: 1,
    prompt: 'Use evidence.',
    scenario: 'Prepare a plan.',
    answer: 'Draft ready for review.',
    feedback: 'Good evidence use.',
    trace: [],
    ...overrides,
  };
}

describe('run observability', () => {
  it('summarizes successful reads and practice writes', () => {
    const insights = runInsights(
      run({
        trace: [
          {
            tool: 'drive.search',
            input: JSON.stringify({
              app: 'drive',
              tool: 'search',
              query: 'RISE',
            }),
            output: '[]',
            status: 'success',
          },
          {
            tool: 'notion.create',
            input: JSON.stringify({
              app: 'notion',
              tool: 'create',
              title: 'Draft plan',
            }),
            output: JSON.stringify({ simulated: true }),
            status: 'success',
          },
        ],
        usage: {
          turns: 3,
          toolCalls: 2,
          turnLimit: 12,
          toolCallLimit: 10,
          stopReason: 'answered',
        },
      }),
      limits
    );
    expect(insights).toMatchObject({
      apps: 2,
      failed: 0,
      reads: 1,
      status: 'complete',
      successful: 2,
      writes: 1,
    });
  });

  it('recognizes legacy errors and limit stops', () => {
    const insights = runInsights(
      run({
        answer:
          'The agent used its available tool calls before producing a final response.',
        trace: [
          {
            tool: 'notion.notion',
            input: '{"app":"notion","tool":"notion"}',
            output: '{"error":"unknown_tool"}',
          },
        ],
      }),
      limits
    );
    expect(insights.status).toBe('limited');
    expect(insights.failed).toBe(1);
    expect(insights.apps).toBe(0);
    expect(insights.stopReason).toBe('tool_limit');
    expect(insights.steps[0]).toMatchObject({
      action: 'notion',
      app: 'notion',
      errorCode: 'unknown_tool',
      status: 'error',
    });
  });
});
