import {
  seedRecords,
  starterScenarios,
  type Team,
} from '@tuturuuu/multiplayer';
import { describe, expect, it, vi } from 'vitest';
import { compileSkills, makeScenario, runAgent } from './ai';
import type { Env } from './env';

function model(...values: unknown[]) {
  const run = vi.fn(async () => ({ response: JSON.stringify(values.shift()) }));
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
    };
    const result = await runAgent(env, team, starterScenarios()[0]!);
    expect(run).toHaveBeenCalledTimes(4);
    expect(result.run.trace.map((t) => t.tool)).toEqual([
      'drive.read',
      'zalo.create',
    ]);
    expect(result.records).toHaveLength(team.records.length + 1);
    expect(team.records).toHaveLength(16);
    expect(result.run.prompt).toBe(team.prompt);
    expect(result.run.scenario).toBe(starterScenarios()[0]!.brief);
  });
});
