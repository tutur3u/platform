import { afterEach, expect, it, vi } from 'vitest';
import {
  createMeetFollowup,
  getMeetFollowupContext,
  type MeetFollowupInput,
} from './meet-followups';

afterEach(() => vi.unstubAllGlobals());
it('keeps follow-ups on the Meet API origin and preserves the reviewed identity and request receipt', async () => {
  const fetch = vi.fn(
    async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(
        JSON.stringify({ url: 'https://calendar.tuturuuu.com/personal' }),
        { headers: { 'content-type': 'application/json' } }
      )
  );
  vi.stubGlobal('fetch', fetch);
  vi.stubGlobal('location', {
    hostname: 'meet.tuturuuu.com',
    origin: 'https://meet.tuturuuu.com',
  });
  await getMeetFollowupContext(
    'workspace/id',
    'meeting/id',
    'destination',
    'board'
  );
  expect(String(fetch.mock.calls[0]?.[0])).toContain(
    '/api/meet-ai/workspace%2Fid/meeting%2Fid/followups'
  );
  const input = {
    requestId: 'receipt',
    userId: 'actor',
    timezone: 'Asia/Ho_Chi_Minh',
  } as MeetFollowupInput;
  await createMeetFollowup('workspace', 'meeting', input);
  expect(fetch).toHaveBeenLastCalledWith(
    expect.stringContaining('/api/meet-ai/workspace/meeting/followups'),
    expect.objectContaining({ method: 'POST', body: JSON.stringify(input) })
  );
});
