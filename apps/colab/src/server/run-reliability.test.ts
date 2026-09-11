import {
  mockApps,
  seedRecords,
  starterScenarios,
  type Team,
} from '@tuturuuu/multiplayer';
import { describe, expect, it, vi } from 'vitest';
import {
  compileSkills,
  executeMockTool,
  normalizeToolInput,
  runAgent,
} from './ai';
import type { Env } from './env';

function model(...responses: unknown[]) {
  const run = vi.fn(async (..._args: unknown[]) => ({
    response: JSON.stringify(responses.shift()),
  }));
  return { env: { AI: { run } } as unknown as Env, run };
}
function team(): Team {
  return {
    id: 'team',
    name: 'Marketing',
    prompt: 'Use evidence and ask before publishing.',
    revision: 0,
    skills: [],
    records: seedRecords(),
    runs: [],
    aiCalls: 0,
    limits: { aiCallLimit: 20, agentTurnLimit: 8, toolCallLimit: 6 },
  };
}

describe('practice tool contract', () => {
  it('permits fifty draft actions by default and still returns an answer', async () => {
    const replies = Array.from({ length: 50 }, (_, index) => ({
      tool: 'notion.draft',
      title: `Draft ${index}`,
      content: 'Review before publishing.',
    }));
    const { env } = model(
      ...replies,
      { answer: '## Complete\n\n50 drafts prepared for review.' },
      { feedback: 'Review them.' }
    );
    const result = await runAgent(env, team(), starterScenarios()[0]!);
    expect(result.run.usage).toMatchObject({
      toolCalls: 50,
      successfulToolCalls: 50,
      failedToolCalls: 0,
      writeToolCalls: 50,
      toolCallLimit: 50,
      stopReason: 'answered',
    });
    expect(
      result.records.filter((record) =>
        record.title.startsWith('Draft: Draft ')
      )
    ).toHaveLength(50);
  });
  it.each(mockApps)(
    'supports search/read/create/update end to end in %s',
    (app) => {
      const records = seedRecords();
      const found = JSON.parse(
        executeMockTool(records, { tool: `${app}.search`, app, query: '' })
      );
      expect(found.length).toBeGreaterThan(0);
      expect(found.every((record: { app: string }) => record.app === app)).toBe(
        true
      );
      expect(
        JSON.parse(
          executeMockTool(records, { tool: `${app}.read`, id: found[0].id })
        ).id
      ).toBe(found[0].id);
      const created = JSON.parse(
        executeMockTool(records, {
          tool: `${app}.create`,
          title: 'Review draft',
          content: 'Ask a member to approve.',
        })
      ).record;
      executeMockTool(records, {
        tool: `${app}.update`,
        app,
        id: created.id,
        title: 'Reviewed draft',
        content: 'Ready for human review.',
      });
      expect(
        JSON.parse(
          executeMockTool(records, { tool: 'read', app, id: created.id })
        ).title
      ).toBe('Reviewed draft');
    }
  );
  it('rejects mismatched namespaces, unsupported actions and cross-app IDs without writes', () => {
    const records = seedRecords();
    const before = structuredClone(records);
    for (const input of [
      {
        tool: 'drive.update',
        app: 'notion',
        id: 'drive-1',
        title: 'x',
        content: 'x',
      },
      { tool: 'drive.publish', app: 'drive', title: 'x', content: 'x' },
      {
        tool: 'update',
        app: 'notion',
        id: 'drive-1',
        title: 'x',
        content: 'x',
      },
    ])
      expect(() => executeMockTool(records, input)).toThrow();
    expect(records).toEqual(before);
    expect(normalizeToolInput({ tool: 'drive.drive.search' }).tool).toBe(
      'drive.drive.search'
    );
  });
});

describe('meaningful agent run', () => {
  it('repairs a malformed final decision without repeating completed writes', async () => {
    const { env, run } = model(
      {
        tool: 'notion.draft',
        title: 'Saved draft',
        content: 'Review this caption.',
      },
      'malformed final JSON',
      { answer: '## Caption\n\nSaved for review.' },
      { feedback: 'Reviewed.' }
    );
    const result = await runAgent(env, team(), starterScenarios()[0]!);
    expect(result.run.answer).toContain('Saved for review');
    expect(result.run.trace).toHaveLength(1);
    expect(
      result.records.filter((record) => record.title === 'Draft: Saved draft')
    ).toHaveLength(1);
    expect(run).toHaveBeenCalledTimes(4);
  });
  it('compiles skills, gathers evidence, writes a draft and returns sections with a clean trace', async () => {
    const { env, run } = model(
      {
        skills: [
          {
            name: 'rise-writer',
            description: 'Draft with evidence',
            body: 'Read first. Ask before publishing.',
          },
        ],
      },
      { tool: 'drive.search', app: 'drive', query: 'Induction' },
      { tool: 'drive.read', app: 'drive', id: 'rise-induction-brief' },
      {
        tool: 'notion.create',
        app: 'notion',
        title: 'Induction draft',
        content: 'Awaiting club approval.',
      },
      {
        answer: {
          english_caption: 'Join RISE!\nAsk for confirmed event details.',
          source_notes: ['Approved rehearsal brief'],
          readiness_checklist: { human_review: 'Required' },
        },
      },
      { feedback: 'The draft used evidence and retained human approval.' }
    );
    const draftTeam = team();
    draftTeam.skills = await compileSkills(env, draftTeam.prompt, false);
    const result = await runAgent(
      env,
      draftTeam,
      starterScenarios()[0]!,
      draftTeam.limits
    );
    expect(result.run.trace.map((step) => step.tool)).toEqual([
      'drive.search',
      'drive.read',
      'notion.create',
    ]);
    expect(result.run.usage).toMatchObject({
      failedToolCalls: 0,
      successfulToolCalls: 3,
      writeToolCalls: 1,
      stopReason: 'answered',
    });
    expect(JSON.parse(result.run.answer).english_caption).toContain(
      'Join RISE'
    );
    expect(
      result.records.some((record) => record.title === 'Induction draft')
    ).toBe(true);
    expect(
      draftTeam.records.some((record) => record.title === 'Induction draft')
    ).toBe(false);
    expect(run).toHaveBeenCalledTimes(6);
  });
  it('reserves the last turn for an evidence-grounded answer without exceeding limits', async () => {
    const { env, run } = model(
      { tool: 'search', app: 'drive', query: 'Induction' },
      { answer: 'Draft based on the approved rehearsal brief.' },
      { feedback: 'Reviewed.' }
    );
    const result = await runAgent(env, team(), starterScenarios()[0]!, {
      agentTurnLimit: 2,
      toolCallLimit: 1,
    });
    expect(result.run.usage).toMatchObject({
      turns: 2,
      toolCalls: 1,
      stopReason: 'answered',
    });
    const request = run.mock.calls[1]?.[1] as {
      messages: Array<{ content: string }>;
    };
    expect(request.messages[0]?.content).toContain('FINAL RESPONSE REQUIRED');
    expect(run).toHaveBeenCalledTimes(3);
  });
  it('never executes another action on the reserved final turn', async () => {
    const { env } = model(
      {
        tool: 'create',
        app: 'drive',
        title: 'Unperformed',
        content: 'Do not persist',
      },
      { feedback: 'No final answer.' }
    );
    const result = await runAgent(env, team(), starterScenarios()[0]!, {
      agentTurnLimit: 1,
      toolCallLimit: 5,
    });
    expect(result.run.trace).toEqual([]);
    expect(result.run.usage?.stopReason).toBe('turn_limit');
    expect(
      result.records.some((record) => record.title === 'Unperformed')
    ).toBe(false);
  });
  it('preserves completed answers and traces when coaching output fails', async () => {
    const { env } = model(
      { tool: 'drive.read', id: 'drive-1' },
      { answer: 'Saved answer' },
      'malformed review'
    );
    const result = await runAgent(env, team(), starterScenarios()[0]!);
    expect(result.run.answer).toBe('Saved answer');
    expect(result.run.trace).toHaveLength(1);
    expect(result.run.feedback).toBe('[colab:coaching-unavailable]');
  });
});
