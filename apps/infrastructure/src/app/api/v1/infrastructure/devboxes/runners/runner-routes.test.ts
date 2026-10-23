import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authorizeMock, setFeatureMock, setDrainMock } = vi.hoisted(() => ({
  authorizeMock: vi.fn(),
  setFeatureMock: vi.fn(),
  setDrainMock: vi.fn(),
}));
vi.mock('@/lib/devboxes/authorization', () => ({
  authorizeDevboxRootAdmin: authorizeMock,
}));
vi.mock('@/lib/devboxes/admin-store', () => ({
  setDevboxRunnerFeature: setFeatureMock,
}));
vi.mock('@/lib/devboxes/admin-runner-control', () => ({
  setDevboxRunnerDrain: setDrainMock,
}));

import { NextResponse } from 'next/server';
import { POST as drain } from './[runnerId]/drain/route';
import { POST as features } from './[runnerId]/features/route';

const runnerId = '11111111-1111-4111-8111-111111111111';
const request = (body: unknown) =>
  new Request('https://infra.test/api', {
    method: 'POST',
    body: JSON.stringify(body),
  });
const params = (id = runnerId) => ({
  params: Promise.resolve({ runnerId: id }),
});

describe('runner trust routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authorizeMock.mockResolvedValue({ ok: true, user: { id: 'admin' } });
  });

  it('requires the root admin gate before touching a runner', async () => {
    authorizeMock.mockResolvedValue({
      ok: false,
      response: NextResponse.json({ message: 'Forbidden' }, { status: 403 }),
    });
    expect(
      (await features(request({ feature: 'run', enabled: true }), params()))
        .status
    ).toBe(403);
    expect((await drain(request({ draining: true }), params())).status).toBe(
      403
    );
    expect(setFeatureMock).not.toHaveBeenCalled();
    expect(setDrainMock).not.toHaveBeenCalled();
  });

  it('validates runner ids and bodies strictly', async () => {
    for (const [body, id] of [
      [{ feature: 'root', enabled: true }, runnerId],
      [{ feature: 'run', enabled: 'yes' }, runnerId],
      [{ feature: 'run', enabled: true, extra: 1 }, runnerId],
      [{ feature: 'run', enabled: true }, 'not-a-uuid'],
    ] as const)
      expect((await features(request(body), params(id))).status).toBe(400);
    expect((await drain(request({ draining: 1 }), params())).status).toBe(400);
    expect(setFeatureMock).not.toHaveBeenCalled();
  });

  it('forwards valid changes to the guarded RPCs', async () => {
    setFeatureMock.mockResolvedValue(undefined);
    setDrainMock.mockResolvedValue({
      drain_requested_at: '2026-10-23T00:00:00Z',
    });
    const feature = await features(
      request({ feature: 'judge', enabled: false }),
      params()
    );
    expect(await feature.json()).toEqual({
      runnerId,
      feature: 'judge',
      enabled: false,
    });
    expect(setFeatureMock).toHaveBeenCalledWith(runnerId, 'judge', false);
    const drained = await drain(request({ draining: true }), params());
    expect(await drained.json()).toEqual({
      runnerId,
      drain_requested_at: '2026-10-23T00:00:00Z',
    });
  });

  it('returns RPC trust rejections as errors without partial success', async () => {
    setFeatureMock.mockRejectedValue(
      new Error(
        'Trusted workloads require a runner identity separate from Judge and playground'
      )
    );
    const response = await features(
      request({ feature: 'run', enabled: true }),
      params()
    );
    expect(response.status).toBe(500);
    expect((await response.json()).message).toContain('separate');
  });
});
