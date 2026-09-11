import { describe, expect, it, vi } from 'vitest';
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
const environment = (value: unknown) =>
  ({
    AI: { run: vi.fn().mockResolvedValue({ response: JSON.stringify(value) }) },
  }) as unknown as Env;
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
