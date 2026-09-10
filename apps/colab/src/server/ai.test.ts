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
  it('unwraps Workers AI responses that include usage metadata', async () => {
    const env = {
      AI: {
        run: async () => ({
          response: JSON.stringify({
            skills: [
              {
                name: 'study-planner',
                description: 'Plan study work',
                body: 'Check deadlines and capacity.',
              },
            ],
          }),
          usage: { prompt_tokens: 120, completion_tokens: 80 },
          tool_calls: [],
        }),
      },
    } as unknown as Env;
    expect((await compileSkills(env, 'Plan study work', false))[0]?.name).toBe(
      'study-planner'
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
  it('accepts a top-level array and safely normalizes names', async () => {
    const { env } = model([
      { name: '../Event / Planning', body: ['Check evidence.', 'Ask first.'] },
    ]);
    const skills = await compileSkills(env, 'Plan our event safely.', true);
    expect(skills[0]?.name).toBe('event-planning');
    expect(skills[0]?.description).toContain('event planning');
    expect(skills[0]?.markdown).toContain('Check evidence.\n\nAsk first.');
  });
  it('repairs duplicate names, missing fields, and excess skills', async () => {
    const { env } = model({
      generatedSkills: Array.from({ length: 5 }, () => ({
        title: 'Campaign helper',
      })),
    });
    const skills = await compileSkills(
      env,
      'Use verified campaign facts and ask before publishing.',
      true
    );
    expect(skills.map((skill) => skill.name)).toEqual([
      'campaign-helper',
      'campaign-helper-2',
      'campaign-helper-3',
      'campaign-helper-4',
    ]);
    expect(skills[0]?.markdown).toContain('Use verified campaign facts');
  });
  it('retries incomplete model output before compiling skills', async () => {
    const { env, run } = model('not json', {
      skills: [
        {
          name: 'evidence-checker',
          description: 'Check evidence',
          body: 'Verify facts before drafting.',
        },
      ],
    });
    const skills = await compileSkills(env, 'Check evidence first.', false);
    expect(run).toHaveBeenCalledTimes(2);
    expect(skills[0]?.name).toBe('evidence-checker');
  });
  it('returns a safe prompt-based skill when both AI responses are unusable', async () => {
    const { env, run } = model('not json', 'still not json');
    const skills = await compileSkills(
      env,
      'Protect student privacy and ask before outreach.',
      true
    );
    expect(run).toHaveBeenCalledTimes(2);
    expect(skills).toHaveLength(1);
    expect(skills[0]?.name).toBe('team-working-guide');
    expect(skills[0]?.markdown).toContain('Protect student privacy');
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
