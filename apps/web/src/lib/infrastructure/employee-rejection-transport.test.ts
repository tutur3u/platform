import { checkEnvVariables } from '@tuturuuu/supabase/next/common';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@tuturuuu/supabase/next/common', () => ({
  checkEnvVariables: vi.fn(),
}));
vi.mock('./employee-creation-authorization', () => ({
  authorizeEmployeeCreation: vi.fn(),
}));
vi.mock('./employee-request-origin', () => ({
  employeeRequestOrigin: (r: Request) => new URL(r.url).origin,
}));

import { authorizeEmployeeCreation } from './employee-creation-authorization';
import {
  connectEmployeeRejection,
  handleEmployeeRejection,
  makeEmployeeRejectionBoundary,
} from './employee-rejection-boundary';

const id = (n: number) =>
  `10000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const ready = {
  status: 'retry_ready',
  operationId: id(2),
  actorUserId: id(1),
  targetUserId: id(3),
  email: 'staff@tuturuuu.com',
  displayName: 'Staff',
  originalLeaseId: id(4),
  originalAttemptEventId: id(5),
  expectedVersion: 3,
  eventId: id(6),
  evidenceReferenceSha256: 'a'.repeat(64),
};
const transport = vi.fn<typeof fetch>();
const cli = vi.fn();
const request = () => new Request('https://web.test/rejection');
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(checkEnvVariables).mockReturnValue({
    url: 'https://synthetic.supabase.co',
    key: 'synthetic-test-only',
  });
  vi.mocked(authorizeEmployeeCreation).mockResolvedValue({
    authorized: false,
    status: 401,
  });
  cli.mockResolvedValue({ authorized: true, actorUserId: id(1) });
  transport.mockResolvedValue(Response.json(ready));
  vi.stubGlobal('fetch', transport);
});
afterEach(() => vi.unstubAllGlobals());
it('keeps ordinary rejection on the Infra authorizer and denies before connecting', async () => {
  const response = await handleEmployeeRejection(request(), id(2));
  expect(response.status).toBe(401);
  expect(await response.json()).toEqual({ code: 'employee_rejection_denied' });
  expect(authorizeEmployeeCreation).toHaveBeenCalledExactlyOnceWith(
    expect.any(Request)
  );
  expect(checkEnvVariables).not.toHaveBeenCalled();
  expect(transport).not.toHaveBeenCalled();
  expect(cli).not.toHaveBeenCalled();
});
it.each(['infra', 'cli'])(
  'binds the same private inspect RPC and fresh read authorization for %s',
  async (kind) => {
    vi.mocked(authorizeEmployeeCreation).mockResolvedValue({
      authorized: true,
      actorUserId: id(1),
    });
    const handler =
      kind === 'infra'
        ? handleEmployeeRejection
        : makeEmployeeRejectionBoundary({
            authorize: cli,
            connect: connectEmployeeRejection,
          });
    const response = await handler(request(), id(2));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(ready);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(checkEnvVariables).toHaveBeenCalledExactlyOnceWith({
      useSecretKey: true,
    });
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, init] = transport.mock.calls[0]!;
    expect(String(url)).toBe(
      'https://synthetic.supabase.co/rest/v1/rpc/inspect_employee_creation_rejection'
    );
    expect(JSON.parse(String(init?.body))).toEqual({
      p_actor_id: id(1),
      p_operation_id: id(2),
    });
    const headers = new Headers(init?.headers);
    expect(headers.get('Content-Profile')).toBe('private');
    expect(headers.get('Accept-Profile')).toBe('private');
    expect(headers.get('Prefer')).toBe('tx=commit');
    expect(init?.method).toBe('POST');
    expect(init?.cache).toBe('no-store');
    expect(init?.redirect).toBe('error');
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(
      kind === 'infra' ? authorizeEmployeeCreation : cli
    ).toHaveBeenCalledTimes(2);
    expect(
      kind === 'infra' ? cli : authorizeEmployeeCreation
    ).not.toHaveBeenCalled();
  }
);
it.each(['infra', 'cli'])(
  'withholds readback after late %s denial without replay',
  async (kind) => {
    const authorize =
      kind === 'infra' ? vi.mocked(authorizeEmployeeCreation) : cli;
    authorize
      .mockResolvedValueOnce({ authorized: true, actorUserId: id(1) })
      .mockResolvedValue({ authorized: false, status: 403 });
    const handler =
      kind === 'infra'
        ? handleEmployeeRejection
        : makeEmployeeRejectionBoundary({
            authorize: cli,
            connect: connectEmployeeRejection,
          });
    const response = await handler(request(), id(2));
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      code: 'employee_rejection_denied',
    });
    expect(transport).toHaveBeenCalledTimes(1);
  }
);
it('uses the explicit adjudication RPC without converting lost acknowledgement into retry', async () => {
  const port = await connectEmployeeRejection();
  transport.mockRejectedValueOnce(new Error('lost acknowledgement'));
  await expect(
    port.adjudicate({
      p_actor_id: id(1),
      p_operation_id: id(2),
      p_event_id: id(6),
    })
  ).rejects.toThrow('lost acknowledgement');
  expect(transport).toHaveBeenCalledTimes(1);
  expect(String(transport.mock.calls[0]?.[0])).toBe(
    'https://synthetic.supabase.co/rest/v1/rpc/adjudicate_employee_creation_rejection'
  );
  expect(JSON.parse(String(transport.mock.calls[0]?.[1]?.body))).toEqual({
    p_actor_id: id(1),
    p_operation_id: id(2),
    p_event_id: id(6),
  });
});
it.each(['http-error', 'rollback', 'oversize', 'malformed'])(
  'fails closed for %s on private transport without replay',
  async (kind) => {
    transport.mockResolvedValueOnce(
      kind === 'http-error'
        ? Response.json({}, { status: 503 })
        : kind === 'rollback'
          ? Response.json(ready, {
              headers: { 'preference-applied': 'tx=rollback' },
            })
          : new Response(kind === 'oversize' ? 'x'.repeat(262145) : '{')
    );
    const response = await makeEmployeeRejectionBoundary({
      authorize: cli,
      connect: connectEmployeeRejection,
    })(request(), id(2));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      code: 'employee_rejection_unconfirmed',
    });
    expect(transport).toHaveBeenCalledTimes(1);
    expect(cli).toHaveBeenCalledTimes(1);
  }
);
it('returns unavailable without network dispatch if server configuration fails', async () => {
  vi.mocked(checkEnvVariables).mockImplementationOnce(() => {
    throw new Error('unavailable');
  });
  const response = await makeEmployeeRejectionBoundary({
    authorize: cli,
    connect: connectEmployeeRejection,
  })(request(), id(2));
  expect(response.status).toBe(503);
  expect(transport).not.toHaveBeenCalled();
});
