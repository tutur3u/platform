import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import type { Env } from './env';
import { reviewPrompt } from './prompt-review';

const prompt =
  'You are a RISE editor. Read approved sources. Draft and verify. Return two captions.';
const sections = ['role', 'inputs', 'steps', 'output'].map((id) => ({
  id,
  quote: 'Read approved sources.',
  explanation: 'This asks for evidence.',
  improvement: 'Ask when an event fact is missing.',
}));
afterEach(() => vi.unstubAllGlobals());
const environment = (value: unknown) => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      Response.json(
        {
          id: 'request-1',
          choices: [
            { message: { content: { response: JSON.stringify(value) } } },
          ],
          tuturuuu: { run_id: 'ledger-run', billing: { billedCredits: 1 } },
        },
        {
          headers: {
            'x-colab-sponsor-workspace': '00000000-0000-0000-0000-000000000000',
          },
        }
      )
    )
  );
  return {
    COLAB_AI_API_KEY: 'test-only-key',
    sponsorship: {
      workshopId: 'room',
      workshopTitle: 'RISE',
      hostId: 'host',
      teamId: 'team-1',
      teamName: 'Marketing',
      participantId: 'guest:member',
      operation: 'analyze',
      scenarioId: 'rise-induction-post',
      jobId: '07a13d30-0599-4572-8d1d-159860105e10',
      sequence: 0,
      receipts: [],
    },
  } as unknown as Env;
};
describe('AI prompt review', () => {
  it.each(['summary', 'explanation', 'improvement'])(
    'rejects blank %s',
    async (field) => {
      const value = {
        summary: 'Review',
        sections: sections.map((section) => ({
          ...section,
          ...(field !== 'summary' ? { [field]: '   ' } : {}),
        })),
      };
      if (field === 'summary') value.summary = '   ';
      await expect(
        reviewPrompt(environment(value), prompt, 1, 'rise', 'en')
      ).rejects.toThrow('ai_invalid_output');
    }
  );
  it('returns shared, revision-bound framework explanations', async () => {
    const review = await reviewPrompt(
      environment({ summary: 'Good evidence habit.', sections }),
      prompt,
      3,
      'rise',
      'en'
    );
    expect(review).toMatchObject({
      revision: 3,
      framework: 'rise',
      summary: 'Good evidence habit.',
      sections,
    });
  });
  it('rejects invented quotes rather than misrepresenting the team prompt', async () => {
    await expect(
      reviewPrompt(
        environment({
          summary: 'Review',
          sections: sections.map((section) => ({
            ...section,
            quote: 'Publish without review.',
          })),
        }),
        prompt,
        1,
        'rise',
        'vi'
      )
    ).rejects.toThrow('ai_invalid_output');
  });
  it('rejects missing framework sections', async () => {
    await expect(
      reviewPrompt(
        environment({ summary: 'Review', sections: sections.slice(1) }),
        prompt,
        1,
        'rise',
        'en'
      )
    ).rejects.toThrow('ai_invalid_output');
  });
});
