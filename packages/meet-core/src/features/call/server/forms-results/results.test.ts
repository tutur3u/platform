import { describe, expect, it, vi } from 'vitest';
import { exportFormsResults, readFormsResults } from './results';

const meetingId = '7ee82c83-1e55-408a-8f74-f12123372c51';
const launchId = 'fd5eafc4-6ce3-48c0-9332-200ceed4176e';
const formId = '0d5c5784-753d-430f-b5be-8cca40c7761d';
const versionId = 'dad42ee5-4b00-40f6-a30f-70aa0ffc78c0';
const scope = { isHost: true, meetingId, launchId };
const snapshot = {
  meetingId,
  launchId,
  formId,
  versionId,
  title: 'Exit ticket',
  responseMode: 'anonymous',
  responseCount: 3,
  respondentEmail: 'private@example.com',
  respondentUserId: 'private-user-id',
  questions: [
    {
      id: 'q1',
      title: '=Question',
      answeredCount: 3,
      answerKey: 'private-answer-key',
      breakdown: [
        { label: '＋Option', count: 2, respondentName: 'private-name' },
      ],
    },
  ],
};

describe('Meet form results', () => {
  it('rejects non-hosts before calling the private results source', async () => {
    const read = vi.fn(async () => snapshot);
    await expect(
      readFormsResults({ ...scope, isHost: false }, read)
    ).rejects.toMatchObject({ status: 403 });
    expect(read).not.toHaveBeenCalled();
  });

  it.each([{ meetingId: formId }, { launchId: versionId }])(
    'fails closed on an unexpected scope %j',
    async (override) => {
      await expect(
        readFormsResults(scope, async () => ({ ...snapshot, ...override }))
      ).rejects.toMatchObject({ status: 404 });
    }
  );

  it('retains results for a launch with zero responses', async () => {
    const results = await readFormsResults(scope, async () => ({
      ...snapshot,
      responseCount: 0,
      questions: [],
    }));
    expect(results).toMatchObject({ versionId, responseCount: 0 });
  });

  it('exports anonymous aggregates with formula-safe text and omits private fields', async () => {
    const results = await readFormsResults(scope, async () => snapshot);
    expect(results).toEqual({
      launchId,
      formId,
      versionId,
      title: 'Exit ticket',
      responseMode: 'anonymous',
      responseCount: 3,
      questions: [
        {
          id: 'q1',
          title: '=Question',
          answeredCount: 3,
          breakdown: [{ label: '＋Option', count: 2 }],
        },
      ],
    });
    expect(exportFormsResults(results)).toBe(
      "Response mode,Responses,Question,Answered,Option,Count\r\nanonymous,3,,,,\r\n,,'=Question,3,'＋Option,2"
    );
  });
});
