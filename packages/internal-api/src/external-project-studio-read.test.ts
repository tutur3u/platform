import { expect, it, vi } from 'vitest';
import { getWorkspaceExternalProjectStudio } from './external-projects';

it('requests content-only Studio data for the editor client', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(
    async () =>
      new Response(JSON.stringify({ importJobs: [], publishEvents: [] }))
  );
  const result = await getWorkspaceExternalProjectStudio('ws 1', {
    baseUrl: 'https://api.example.test',
    fetch,
  });
  expect(fetch.mock.calls[0]?.[0]).toBe(
    'https://api.example.test/api/v1/workspaces/ws%201/external-projects?view=content'
  );
  expect(result).toEqual({ importJobs: [], publishEvents: [] });
});
