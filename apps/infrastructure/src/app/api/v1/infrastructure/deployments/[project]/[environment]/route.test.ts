import { beforeEach, describe, expect, it, vi } from 'vitest';

const { authorizeInfrastructureOperatorMock, fetchMock } = vi.hoisted(() => ({
  authorizeInfrastructureOperatorMock: vi.fn(),
  fetchMock: vi.fn<typeof fetch>(),
}));

vi.mock('../../../monitoring/blue-green/authorization', () => ({
  authorizeInfrastructureOperator: authorizeInfrastructureOperatorMock,
}));

import { POST } from './route';

const ID = '00000000-0000-4000-8000-000000000001';
const call = (environment: string, body: unknown) =>
  POST(
    new Request(
      `http://localhost/api/v1/infrastructure/deployments/calendar/${environment}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    ),
    { params: Promise.resolve({ project: 'calendar', environment }) }
  );

describe('deployment action route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('DEPLOY_COORDINATOR_ORIGIN', 'https://deploy.example');
    vi.stubEnv('DEPLOY_COORDINATOR_OPERATOR_TOKEN', 'operator-token');
    authorizeInfrastructureOperatorMock.mockResolvedValue({
      ok: true,
      user: { id: 'user-1' },
    });
  });

  it('requires the operator permission', async () => {
    authorizeInfrastructureOperatorMock.mockResolvedValue({
      ok: false,
      response: Response.json({ message: 'Forbidden' }, { status: 403 }),
    });
    expect((await call('production', { action: 'resume' })).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('answers unconfigured without calling out', async () => {
    vi.stubEnv('DEPLOY_COORDINATOR_OPERATOR_TOKEN', '');
    const response = await call('production', { action: 'resume' });
    expect(response.status).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unknown environments and invalid actions', async () => {
    expect((await call('qa', { action: 'resume' })).status).toBe(404);
    expect(
      (await call('production', { action: 'promote', deploymentId: ID })).status
    ).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards the action under the signed-in operator', async () => {
    fetchMock.mockResolvedValue(Response.json({}));
    const response = await call('production', {
      action: 'rollback',
      deploymentId: ID,
    });
    expect(response.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(
      `https://deploy.example/v1/projects/calendar/environments/production/deployments/${ID}/rollback`
    );
    expect(init?.headers).toMatchObject({
      Authorization: 'Bearer operator-token',
      'X-Deploy-Actor': 'user-1',
    });
  });

  it('passes coordinator refusals through with their code', async () => {
    fetchMock.mockResolvedValue(
      Response.json({ error: 'INVALID_STATE' }, { status: 409 })
    );
    const response = await call('production', {
      action: 'cancel',
      deploymentId: ID,
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ message: 'INVALID_STATE' });
  });
});
