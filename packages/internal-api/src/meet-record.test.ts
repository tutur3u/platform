import { afterEach, expect, it, vi } from 'vitest';
import {
  getMeetingProjectLinks,
  linkMeetingProject,
  unlinkMeetingProject,
} from './meet-record';

afterEach(() => vi.unstubAllGlobals());

it('keeps meeting project links on the Meet API origin', async () => {
  const fetch = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({ linked: [], available: [], canLink: false }),
        {
          headers: { 'content-type': 'application/json' },
        }
      )
  );
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('window', {
    location: {
      hostname: 'meet.tuturuuu.com',
      origin: 'https://meet.tuturuuu.com',
    },
  });

  await getMeetingProjectLinks('workspace/id', 'meeting/id');
  await linkMeetingProject('ws', 'meeting', 'project-1');
  await unlinkMeetingProject('ws', 'meeting', 'project-1');

  expect(String(fetch.mock.calls[0]?.[0])).toBe(
    '/api/meet-record/workspace%2Fid/meeting%2Fid/projects'
  );
  expect(fetch.mock.calls[1]?.[1]?.method).toBe('POST');
  expect(fetch.mock.calls[1]?.[1]?.body).toBe(
    JSON.stringify({ projectId: 'project-1' })
  );
  expect(fetch.mock.calls[2]?.[1]?.method).toBe('DELETE');
});
