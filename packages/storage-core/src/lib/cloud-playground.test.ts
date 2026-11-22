import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('./playground-service', () => ({ getPlayground: vi.fn() }));
vi.mock('@tuturuuu/utils/account-benefits-server', () => {
  class AccountServiceError extends Error {
    constructor(
      public status: number,
      message = 'Account service unavailable'
    ) {
      super(message);
    }
  }
  return { AccountServiceError, accountPrivateRpc: vi.fn() };
});

const { CloudPlaygroundRefusal, readCloudPlayground, startCloudPlayground } =
  await import('./cloud-playground');

const scope = {
  meetingId: '00000000-0000-4000-8000-000000000001',
  ownerId: '00000000-0000-4000-8000-000000000002',
  projectId: '00000000-0000-4000-8000-000000000003',
};
const request = {
  requester: '00000000-0000-4000-8000-000000000004',
  requestId: '00000000-0000-4000-8000-000000000005',
  revision: 3,
};
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv('PLAYGROUND_EXECUTION_ORIGIN', 'https://execution.example');
  vi.stubEnv('PLAYGROUND_INGRESS_SECRET', 'i'.repeat(40));
  vi.stubEnv('PLAYGROUND_SOURCE_TICKET_SECRET', `${'s'.repeat(40)}\n`);
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

async function refusal(response: Response | Error) {
  if (response instanceof Error) fetchMock.mockRejectedValueOnce(response);
  else fetchMock.mockResolvedValueOnce(response);
  const error = await startCloudPlayground(scope, request).catch(
    (caught: unknown) => caught
  );
  expect(error).toBeInstanceOf(CloudPlaygroundRefusal);
  const { status, code, retryAfterSeconds } = error as InstanceType<
    typeof CloudPlaygroundRefusal
  >;
  return { status, code, retryAfterSeconds };
}

describe('cloud Playground refusals', () => {
  it.each([
    ['global_capacity', 429],
    ['user_busy', 429],
    ['project_busy', 429],
  ])('reports %s as busy with a short retry', async (code, status) => {
    expect(await refusal(Response.json({ code }, { status }))).toEqual({
      status: 429,
      code: 'PLAYGROUND_BUSY',
      retryAfterSeconds: 5,
    });
  });

  it('reports a rate or daily limit as quota with the window time, capped', async () => {
    expect(
      await refusal(
        Response.json(
          { code: 'user_rate_limit', retryAfterSeconds: 42 },
          { status: 429 }
        )
      )
    ).toEqual({ status: 429, code: 'PLAYGROUND_QUOTA', retryAfterSeconds: 42 });
    expect(
      await refusal(
        Response.json(
          { code: 'daily_capacity', retryAfterSeconds: 7200 },
          { status: 429 }
        )
      )
    ).toEqual({
      status: 429,
      code: 'PLAYGROUND_QUOTA',
      retryAfterSeconds: 600,
    });
    expect(
      await refusal(Response.json({ code: 'daily_capacity' }, { status: 429 }))
    ).toEqual({
      status: 429,
      code: 'PLAYGROUND_QUOTA',
      retryAfterSeconds: 600,
    });
  });

  it('reports a request conflict without a retry hint', async () => {
    expect(
      await refusal(
        Response.json({ code: 'request_conflict' }, { status: 409 })
      )
    ).toEqual({
      status: 409,
      code: 'PLAYGROUND_REQUEST_CONFLICT',
      retryAfterSeconds: undefined,
    });
  });

  it('reports a paused, failing or unreachable service as unavailable', async () => {
    const unavailable = {
      status: 503,
      code: 'PLAYGROUND_UNAVAILABLE',
      retryAfterSeconds: 30,
    };
    expect(
      await refusal(
        Response.json({ code: 'execution_paused' }, { status: 503 })
      )
    ).toEqual(unavailable);
    expect(
      await refusal(
        Response.json({ code: 'execution_unavailable' }, { status: 503 })
      )
    ).toEqual(unavailable);
    expect(await refusal(new Response('bad gateway', { status: 502 }))).toEqual(
      unavailable
    );
    expect(await refusal(new TypeError('fetch failed'))).toEqual(unavailable);
    vi.stubEnv('PLAYGROUND_EXECUTION_ORIGIN', '');
    const error = await startCloudPlayground(scope, request).catch(
      (caught: unknown) => caught
    );
    expect(error).toMatchObject(unavailable);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('applies the trimmed secret length the API proxy enforces', async () => {
    // 31 characters plus a newline: the proxy trims it and refuses the ticket,
    // so no Run is dispatched with a ticket that cannot reach Web.
    vi.stubEnv('PLAYGROUND_SOURCE_TICKET_SECRET', `${'s'.repeat(31)}\n`);
    await expect(startCloudPlayground(scope, request)).rejects.toMatchObject({
      status: 503,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('cloud Playground results', () => {
  it('passes the service failure reason and defaults it to null', async () => {
    const base = {
      runId: '00000000-0000-8000-8000-000000000006',
      exitCode: null,
      output: '',
      revision: 3,
      saved: false,
    };
    fetchMock.mockResolvedValueOnce(
      Response.json({ ...base, status: 'failed', reason: 'sandbox_failed' })
    );
    expect(await readCloudPlayground(scope, base.runId)).toMatchObject({
      status: 'failed',
      reason: 'sandbox_failed',
    });
    fetchMock.mockResolvedValueOnce(
      Response.json({ ...base, status: 'succeeded', exitCode: 0 })
    );
    expect(await readCloudPlayground(scope, base.runId)).toMatchObject({
      status: 'succeeded',
      reason: null,
    });
  });
});
