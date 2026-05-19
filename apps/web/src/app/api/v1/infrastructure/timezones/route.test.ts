import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  authorizeInfrastructureOperatorMock,
  createTimezoneMock,
  listTimezonesMock,
} = vi.hoisted(() => ({
  authorizeInfrastructureOperatorMock: vi.fn(),
  createTimezoneMock: vi.fn(),
  listTimezonesMock: vi.fn(),
}));

vi.mock('../monitoring/blue-green/authorization', () => ({
  authorizeInfrastructureOperator: authorizeInfrastructureOperatorMock,
}));

vi.mock('@/lib/infrastructure/timezones', () => ({
  createTimezone: createTimezoneMock,
  listTimezones: listTimezonesMock,
}));

import { GET, POST } from './route';

function createRequest(init?: RequestInit) {
  return new Request('http://localhost/api/v1/infrastructure/timezones', init);
}

function authorize() {
  authorizeInfrastructureOperatorMock.mockResolvedValue({ ok: true });
}

function forbid() {
  authorizeInfrastructureOperatorMock.mockResolvedValue({
    ok: false,
    response: Response.json({ message: 'Forbidden' }, { status: 403 }),
  });
}

describe('infrastructure timezones route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects list requests without infrastructure operator access', async () => {
    forbid();

    const request = createRequest();
    const response = await GET(request);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ message: 'Forbidden' });
    expect(authorizeInfrastructureOperatorMock).toHaveBeenCalledWith(request);
    expect(listTimezonesMock).not.toHaveBeenCalled();
  });

  it('lists private timezone rows for infrastructure operators', async () => {
    authorize();
    listTimezonesMock.mockResolvedValue([{ value: 'Asia/Ho_Chi_Minh' }]);

    const response = await GET(createRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual([
      { value: 'Asia/Ho_Chi_Minh' },
    ]);
  });

  it('creates private timezone rows only after authorization', async () => {
    authorize();
    const payload = { value: 'Asia/Ho_Chi_Minh' };
    const request = createRequest({
      body: JSON.stringify(payload),
      method: 'POST',
    });

    const response = await POST(request);

    expect(response.status).toBe(200);
    expect(createTimezoneMock).toHaveBeenCalledWith(payload);
  });
});
