import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const WS_ID = '0b6f8a52-3c1e-4f7a-9d2b-5e8c7a6b4d3f';

const mocks = vi.hoisted(() => ({ createPlan: vi.fn() }));

vi.mock('@tuturuuu/apis/meet/actions', () => ({
  createPlan: (...args: unknown[]) => mocks.createPlan(...args),
}));

const validPlan = {
  name: 'Sync',
  dates: ['2026-11-02'],
  start_time: '09:00+00:00',
  end_time: '17:00+00:00',
  duration_minutes: 60,
  ws_id: WS_ID,
};

function post(body: unknown) {
  return POST(
    new Request('http://localhost/api/v1/meet/plans', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  );
}

describe('POST /api/v1/meet/plans', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a plan', async () => {
    mocks.createPlan.mockResolvedValue({ data: { id: 'plan' } });
    const response = await post(validPlan);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ id: 'plan' });
  });

  it.each([
    ['Not authenticated', 401],
    ['Forbidden', 403],
    ['Failed to verify workspace access', 500],
    ['End time must be after start time', 400],
  ])('maps "%s" to %i', async (error, status) => {
    mocks.createPlan.mockResolvedValue({ error });
    const response = await post(validPlan);
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
  });

  it('rejects an invalid plan before calling the action', async () => {
    const response = await post({ ...validPlan, dates: [] });
    expect(response.status).toBe(400);
    expect(mocks.createPlan).not.toHaveBeenCalled();
  });
});
