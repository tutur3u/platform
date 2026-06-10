import type { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authorizeInfrastructureOperatorMock,
  queueBlueGreenProductionPromoteRequestMock,
} = vi.hoisted(() => ({
  authorizeInfrastructureOperatorMock: vi.fn(),
  queueBlueGreenProductionPromoteRequestMock: vi.fn(),
}));

vi.mock('../authorization', () => ({
  authorizeInfrastructureOperator: authorizeInfrastructureOperatorMock,
}));

vi.mock('@/lib/infrastructure/blue-green-monitoring-controls', () => ({
  queueBlueGreenProductionPromoteRequest:
    queueBlueGreenProductionPromoteRequestMock,
}));

import { POST } from './route';

function createTestRequest() {
  return new Request(
    'http://localhost/api/v1/infrastructure/monitoring/blue-green/production-promote',
    {
      method: 'POST',
    }
  ) as NextRequest;
}

describe('blue-green production-promote route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the authorization response when access is denied', async () => {
    authorizeInfrastructureOperatorMock.mockResolvedValue({
      ok: false,
      response: new Response(JSON.stringify({ message: 'Forbidden' }), {
        status: 403,
      }),
    });

    const response = await POST(createTestRequest());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: 'Forbidden' });
  });

  it('queues a production promote request for authorized operators', async () => {
    authorizeInfrastructureOperatorMock.mockResolvedValue({
      ok: true,
      user: {
        email: 'ops@platform.test',
        id: 'user-1',
      },
    });
    queueBlueGreenProductionPromoteRequestMock.mockReturnValue({
      bypassChecks: true,
      bypassDelay: true,
      kind: 'production-promote',
      requestedAt: '2026-06-10T10:00:00.000Z',
      requestedBy: 'user-1',
      requestedByEmail: 'ops@platform.test',
      sourceBranch: 'main',
      targetBranch: 'production',
    });

    const response = await POST(createTestRequest());

    expect(response.status).toBe(200);
    expect(queueBlueGreenProductionPromoteRequestMock).toHaveBeenCalledWith({
      requestedBy: 'user-1',
      requestedByEmail: 'ops@platform.test',
    });
    await expect(response.json()).resolves.toMatchObject({
      request: {
        bypassChecks: true,
        bypassDelay: true,
        kind: 'production-promote',
        requestedBy: 'user-1',
      },
    });
  });
});
