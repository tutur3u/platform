import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET as bootstrap } from '@/app/api/v1/workspaces/[wsId]/mail/bootstrap/route';
import { GET as threads } from '@/app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/threads/route';
import type { MailRouteContext } from './types';

vi.mock('./auth', () => ({
  resolveMailRouteContext: async (
    _request: NextRequest,
    wsId: string,
    _connected: boolean,
    readBudget: MailRouteContext['readBudget']
  ) => ({
    ok: true,
    context: { normalizedWsId: wsId, readBudget, user: { id: userId } },
  }),
}));

const userId = '00000000-0000-4000-8000-000000000001';
const bootstrapRequest = new NextRequest(
  'https://mail.example.test/bootstrap?view=mailboxes'
);
const threadsRequest = new NextRequest('https://mail.example.test/threads');
const workspace = { wsId: 'workspace' };
const callBootstrap = () =>
  bootstrap(bootstrapRequest, { params: Promise.resolve(workspace) });
const callThreads = () =>
  threads(threadsRequest, {
    params: Promise.resolve({ ...workspace, mailboxId: 'mailbox' }),
  });

describe('managed Mail read deadlines', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv('SUPABASE_SERVER_URL', 'https://supabase.example.test');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'test-key');
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it.each([
    ['bootstrap', callBootstrap],
    ['threads', callThreads],
  ] as const)(
    'aborts slow Supabase %s calls and returns the typed 503 after four seconds',
    async (name, request) => {
      const signals: AbortSignal[] = [];
      const fetch = vi.fn<typeof globalThis.fetch>((_input, init) => {
        if (init?.signal) signals.push(init.signal);
        return new Promise(() => {});
      });
      vi.stubGlobal('fetch', fetch);

      const pending = request();
      let finished = false;
      void pending.then(() => {
        finished = true;
      });
      await vi.advanceTimersByTimeAsync(3_999);
      expect(finished).toBe(false);
      expect(fetch).toHaveBeenCalledTimes(name === 'bootstrap' ? 1 : 2);
      expect(signals.every((signal) => !signal.aborted)).toBe(true);
      await vi.advanceTimersByTimeAsync(1);
      const response = await pending;
      expect(response.status).toBe(503);
      expect(response.headers.get('Retry-After')).toBe('5');
      expect(await response.json()).toEqual({
        code: 'MAIL_READ_TIMEOUT',
        error: 'Mail read timed out',
      });
      expect(signals.every((signal) => signal.aborted)).toBe(true);
      await vi.advanceTimersByTimeAsync(12_000);
      expect(fetch).toHaveBeenCalledTimes(name === 'bootstrap' ? 1 : 2);
    }
  );

  it('returns the existing 403 without reading threads when membership is missing', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(null)
    );
    vi.stubGlobal('fetch', fetch);
    const response = await callThreads();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: 'Forbidden' });
    const tables = fetch.mock.calls.map(
      ([input]) => new URL(String(input)).pathname
    );
    expect(tables.sort()).toEqual([
      '/rest/v1/mail_mailbox_members',
      '/rest/v1/mail_mailboxes',
    ]);
  });

  it('enforces one cumulative deadline even when individual bootstrap calls respond on time', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const path = new URL(String(input)).pathname;
      const data = path.startsWith('/auth/v1/')
        ? {
            user: {
              id: userId,
              email: 'test@example.test',
              email_confirmed_at: '2026-01-01',
            },
          }
        : path.endsWith('/mail_mailboxes')
          ? { id: 'mailbox', type: 'shared' }
          : [];
      await new Promise((resolve) => setTimeout(resolve, 3_100));
      return Response.json(data);
    });
    vi.stubGlobal('fetch', fetch);
    const pending = callBootstrap();
    await vi.advanceTimersByTimeAsync(12_000);
    const response = await pending;
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: 'MAIL_READ_TIMEOUT' });
    expect(fetch.mock.calls.every(([, init]) => init?.signal?.aborted)).toBe(
      true
    );
  });
});
