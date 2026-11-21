import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authorizeInfrastructureOperatorMock,
  deleteTimezoneMock,
  updateTimezoneMock,
} = vi.hoisted(() => ({
  authorizeInfrastructureOperatorMock: vi.fn(),
  deleteTimezoneMock: vi.fn(),
  updateTimezoneMock: vi.fn(),
}));

vi.mock('../../monitoring/blue-green/authorization', () => ({
  authorizeInfrastructureOperator: authorizeInfrastructureOperatorMock,
}));

vi.mock('@/lib/infrastructure/timezones', () => ({
  deleteTimezone: deleteTimezoneMock,
  updateTimezone: updateTimezoneMock,
}));

import { DELETE, PUT } from './route';

const params = {
  params: Promise.resolve({ timezoneId: 'timezone-1' }),
};

function createRequest(init?: RequestInit) {
  return new Request(
    'http://localhost/api/v1/infrastructure/timezones/timezone-1',
    init
  );
}

function authorize() {
  authorizeInfrastructureOperatorMock.mockResolvedValue({ ok: true });
}

function rejectUnauthenticated() {
  authorizeInfrastructureOperatorMock.mockResolvedValue({
    ok: false,
    response: Response.json({ message: 'Unauthorized' }, { status: 401 }),
  });
}

describe('infrastructure timezone detail route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects updates before reading the request body', async () => {
    rejectUnauthenticated();
    const request = createRequest({
      body: JSON.stringify({ value: 'Asia/Ho_Chi_Minh' }),
      method: 'PUT',
    });

    const response = await PUT(request, params);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      message: 'Unauthorized',
    });
    expect(updateTimezoneMock).not.toHaveBeenCalled();
  });

  it('updates private timezone rows for infrastructure operators', async () => {
    authorize();
    const payload = { value: 'Asia/Ho_Chi_Minh' };
    const request = createRequest({
      body: JSON.stringify(payload),
      method: 'PUT',
    });

    const response = await PUT(request, params);

    expect(response.status).toBe(200);
    expect(updateTimezoneMock).toHaveBeenCalledWith('timezone-1', payload);
  });

  it('deletes private timezone rows for infrastructure operators', async () => {
    authorize();

    const response = await DELETE(createRequest({ method: 'DELETE' }), params);

    expect(response.status).toBe(200);
    expect(deleteTimezoneMock).toHaveBeenCalledWith('timezone-1');
  });
});
