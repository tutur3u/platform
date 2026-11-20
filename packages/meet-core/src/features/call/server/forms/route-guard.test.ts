import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { roomRoute } = vi.hoisted(() => ({ roomRoute: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('next/server', () => ({ connection: vi.fn() }));
vi.mock('../room-service', () => ({ roomRoute }));
vi.mock('../../lib/call-access', () => ({
  MeetCallAccessError: class extends Error {},
}));
vi.mock('./definition', () => ({ MAX_FORM_BODY_BYTES: 256_000 }));
vi.mock('./launches', () => ({
  launchActionSchema: { parse: vi.fn() },
  listFormLaunches: vi.fn(),
  listLaunchableForms: vi.fn(),
  runFormLaunchAction: vi.fn(),
}));
vi.mock('./prefill', () => ({
  getFormPrefill: vi.fn(),
  prefillRequestSchema: { parse: vi.fn() },
}));
vi.mock('./submit', () => ({
  submitFormRequestSchema: { parse: vi.fn() },
  submitMeetForm: vi.fn(),
}));
vi.mock('../forms-results/mira-summary', () => ({
  summarizeFormsResults: vi.fn(),
}));
vi.mock('../forms-results/read-launch', () => ({
  loadLaunchResults: vi.fn(),
}));

import { POST as prefill } from '../../../../routes/api/meet-call/[meetingId]/forms/[launchId]/prefill/route';
import { POST as submit } from '../../../../routes/api/meet-call/[meetingId]/forms/[launchId]/submit/route';
import { GET as catalog } from '../../../../routes/api/meet-call/[meetingId]/forms/catalog/route';
import {
  GET as results,
  POST as summary,
} from '../../../../routes/api/meet-call/[meetingId]/forms/results/route';
import {
  GET as list,
  POST as launch,
} from '../../../../routes/api/meet-call/[meetingId]/forms/route';

const meetingId = '00000000-0000-4000-8000-000000000001';
const launchId = '00000000-0000-4000-8000-000000000002';
const cases = [
  { name: 'list', handler: list, method: 'GET' },
  { name: 'launch', handler: launch, method: 'POST' },
  { name: 'catalog', handler: catalog, method: 'GET' },
  { name: 'prefill', handler: prefill, method: 'POST' },
  { name: 'submit', handler: submit, method: 'POST' },
  { name: 'results and export', handler: results, method: 'GET' },
  { name: 'summary', handler: summary, method: 'POST' },
] as const;

beforeEach(() => {
  roomRoute.mockReset();
  roomRoute.mockResolvedValue(new Response(null, { status: 204 }));
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe.each(cases)('Meet Forms $name', ({ handler, method }) => {
  const context = { params: Promise.resolve({ meetingId, launchId }) };

  it.each([undefined, 'false', '1', 'TRUE'])(
    'returns a private 404 before room authorization when the flag is %s',
    async (value) => {
      vi.stubEnv('MEET_FORMS_ENABLED', value);
      const request = new Request('https://meet.example/api/test', { method });

      const response = await handler(request, context);

      expect(response.status).toBe(404);
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(await response.json()).toEqual({ error: 'Not found' });
      expect(roomRoute).not.toHaveBeenCalled();
    }
  );

  it('delegates to the existing room boundary only when enabled', async () => {
    vi.stubEnv('MEET_FORMS_ENABLED', 'true');
    const request = new Request('https://meet.example/api/test', { method });

    expect((await handler(request, context)).status).toBe(204);
    expect(roomRoute).toHaveBeenCalledExactlyOnceWith(
      request,
      meetingId,
      expect.any(Function)
    );
  });
});
