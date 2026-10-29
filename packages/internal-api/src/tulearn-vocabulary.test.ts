import { expect, it, vi } from 'vitest';
import { getTulearnModuleVocabulary } from './tulearn';

it('forwards the selected learner and encoded identifiers to Learn', async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ vocabulary: [] }));
  await expect(
    getTulearnModuleVocabulary('workspace/a', 'module/a', 'student-a', {
      baseUrl: 'https://synthetic.invalid',
      fetch,
    })
  ).resolves.toEqual({ vocabulary: [] });
  expect(fetch.mock.calls[0]?.[0]).toBe(
    'https://synthetic.invalid/api/v1/workspaces/workspace%2Fa/course-modules/module%2Fa/vocabulary?studentId=student-a'
  );
});
