import {
  seedRecords,
  starterScenarios,
  type Team,
} from '@tuturuuu/multiplayer';
import { describe, expect, it, vi } from 'vitest';
import { compileSkills, makeScenario, runAgent } from './ai';
import type { Env } from './env';

function model(...values: unknown[]) {
  const run = vi.fn(async (..._args: unknown[]) => ({
    response: JSON.stringify(values.shift()),
  }));
  return { env: { AI: { run } } as unknown as Env, run };
}
describe('AI output boundaries', () => {
  it('accepts parsed JSON returned by Workers AI JSON mode', async () => {
    const env = {
      AI: {
        run: async () => ({
          response: {
            skills: [
              {
                name: 'draft',
                description: 'Draft safely',
                body: '# Ask first',
              },
            ],
          },
        }),
      },
    } as unknown as Env;
    expect((await compileSkills(env, 'Draft safely', false))[0]?.name).toBe(
      'draft'
    );
  });
  it('creates valid skill frontmatter and preserves markdown as text', async () => {
    const { env } = model({
      skills: [
        {
          name: 'launch-coordinator',
          description: 'Use for a launch: "approval first"',
          body: '# Steps\n\nRead evidence, then ask.',
        },
      ],
    });
    const skills = await compileSkills(env, 'Help coordinate a launch.', false);
    expect(skills[0]?.markdown).toContain(
      'description: "Use for a launch: \\"approval first\\""'
    );
    expect(skills[0]?.markdown).toContain('# Steps');
  });
  it('recovers valid skills from fenced model prose and alternate field names', async () => {
    const run = vi.fn(async () => ({
      response:
        'Here is the requested skill:\n```json\n{"skill":{"title":"Event Planning Helper","summary":"Plan events with evidence","markdown":"# Workflow\\n\\nCheck dates before proposing a plan."}}\n```',
    }));
    const env = { AI: { run } } as unknown as Env;
    const skills = await compileSkills(env, 'Plan our induction day', false);
    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe('event-planning-helper');
    expect(skills[0]?.description).toBe('Plan events with evidence');
    expect(skills[0]?.markdown).toContain('Check dates before proposing');
  });
  it('rejects path traversal, duplicate names and excess skills', async () => {
    for (const skills of [
      [{ name: '../secrets', description: 'x', body: 'x' }],
      Array.from({ length: 2 }, () => ({
        name: 'duplicate',
        description: 'x',
        body: 'x',
      })),
      Array.from({ length: 5 }, (_, i) => ({
        name: `skill-${i}`,
        description: 'x',
        body: 'x',
      })),
    ]) {
      const { env } = model({ skills });
      await expect(compileSkills(env, 'prompt', true)).rejects.toThrow();
    }
  });
  it('labels missing model skill fields as invalid AI output', async () => {
    const { env } = model({ skills: [{ name: 'incomplete' }] });
    await expect(compileSkills(env, 'prompt', false)).rejects.toMatchObject({
      code: 'ai_invalid_output',
      status: 502,
    });
  });
  it('validates scenario criteria and rejects malformed model output', async () => {
    const { env } = model({
      title: 'Scenario',
      brief: 'Brief',
      criteria: ['a'],
    });
    await expect(makeScenario(env, 'steering')).rejects.toThrow(
      'ai_invalid_output'
    );
  });
  it('adds a creative seed only for surprise scenarios', async () => {
    const scenario = {
      title: 'Scenario',
      brief: 'A realistic RISE challenge.',
      criteria: ['Check evidence', 'Protect privacy', 'Ask for approval'],
    };
    const { env, run } = model(scenario, scenario);
    await makeScenario(env, '', true);
    await makeScenario(env, '', false);
    const surpriseRequest = run.mock.calls[0]?.[1] as {
      messages: Array<{ role: string; content: string }>;
    };
    const promptedRequest = run.mock.calls[1]?.[1] as {
      messages: Array<{ role: string; content: string }>;
    };
    const surpriseInput = JSON.parse(surpriseRequest.messages[1]!.content) as {
      creativeSeed?: string;
    };
    const promptedInput = JSON.parse(promptedRequest.messages[1]!.content) as {
      creativeSeed?: string;
    };
    expect(surpriseInput.creativeSeed).toBeTruthy();
    expect(promptedInput.creativeSeed).toBeUndefined();
  });
  it('executes only the actual mock actions and snapshots the run', async () => {
    const { env, run } = model(
      { tool: 'read', app: 'drive', id: 'drive-1' },
      {
        tool: 'create',
        app: 'zalo',
        title: 'Draft for Mai',
        content: 'Please review before posting.',
      },
      { answer: 'Drafted; waiting for approval.' },
      { feedback: 'The agent consulted evidence. Keep approval explicit.' }
    );
    const team: Team = {
      id: 'team-1',
      name: 'A',
      prompt: 'Check and draft.',
      revision: 0,
      skills: [
        {
          name: 'test',
          description: 'Testing',
          markdown: 'Ask before publishing.',
        },
      ],
      records: seedRecords(),
      runs: [],
      aiCalls: 0,
      limits: {
        aiCallLimit: 50,
        agentTurnLimit: 6,
        toolCallLimit: 5,
      },
    };
    const result = await runAgent(env, team, starterScenarios()[0]!);
    expect(run).toHaveBeenCalledTimes(4);
    expect(result.run.trace.map((t) => t.tool)).toEqual([
      'drive.read',
      'zalo.create',
    ]);
    expect(result.records).toHaveLength(team.records.length + 1);
    expect(team.records).toHaveLength(192);
    expect(result.run.prompt).toBe(team.prompt);
    expect(result.run.scenario).toBe(starterScenarios()[0]!.brief);
    expect(result.run.usage).toEqual({
      turns: 3,
      toolCalls: 2,
      turnLimit: 6,
      toolCallLimit: 5,
    });
  });
});
