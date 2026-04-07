import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { HabitTrackerError } from '@/lib/habit-trackers/service';

const mocks = vi.hoisted(() => ({
  createHabitTracker: vi.fn(),
  createHabitTrackerRouteContext: vi.fn(),
  listHabitTrackerCards: vi.fn(),
}));

vi.mock('@/lib/habit-trackers/service', async () => {
  const actual = await vi.importActual('@/lib/habit-trackers/service');

  return {
    ...actual,
    createHabitTracker: mocks.createHabitTracker,
    listHabitTrackerCards: mocks.listHabitTrackerCards,
  };
});

vi.mock('@/lib/habit-trackers/route-utils', async () => {
  const actual = await vi.importActual('@/lib/habit-trackers/route-utils');

  return {
    ...actual,
    createHabitTrackerRouteContext: mocks.createHabitTrackerRouteContext,
  };
});

describe('habit trackers route', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    mocks.createHabitTrackerRouteContext.mockResolvedValue({
      user: { id: 'user-1' },
      sbAdmin: {},
    });
  });

  it('lists trackers with parsed scope query', async () => {
    mocks.listHabitTrackerCards.mockResolvedValue({
      trackers: [],
      members: [],
      scope: 'member',
      scopeUserId: '11111111-1111-4111-8111-111111111111',
      viewerUserId: 'user-1',
    });

    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/habit-trackers/route'
    );

    const response = await GET(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/habit-trackers?scope=member&userId=11111111-1111-4111-8111-111111111111'
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    expect(response.status).toBe(200);
    expect(mocks.listHabitTrackerCards).toHaveBeenCalledWith(
      {},
      'ws-1',
      'user-1',
      'member',
      '11111111-1111-4111-8111-111111111111'
    );
  });

  it('creates trackers through the shared service', async () => {
    mocks.createHabitTracker.mockResolvedValue({
      id: 'tracker-1',
      name: 'Hydration',
    });

    const { POST } = await import(
      '@/app/api/v1/workspaces/[wsId]/habit-trackers/route'
    );

    const response = await POST(
      new NextRequest(
        'http://localhost/api/v1/workspaces/ws-1/habit-trackers',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'Hydration',
            description: 'Drink water',
            color: 'CYAN',
            icon: 'Droplets',
            tracking_mode: 'event_log',
            target_period: 'daily',
            target_operator: 'gte',
            target_value: 8,
            primary_metric_key: 'glasses',
            aggregation_strategy: 'sum',
            input_schema: [
              {
                key: 'glasses',
                label: 'Glasses',
                type: 'number',
                required: true,
              },
            ],
            quick_add_values: [1, 2],
            freeze_allowance: 2,
            recovery_window_periods: 1,
            start_date: '2026-03-24',
            is_active: true,
          }),
        }
      ),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    expect(response.status).toBe(201);
    expect(mocks.createHabitTracker).toHaveBeenCalledWith(
      {},
      'ws-1',
      'user-1',
      expect.objectContaining({
        name: 'Hydration',
        primary_metric_key: 'glasses',
      })
    );
  });

  it('returns not found when habits access is disabled', async () => {
    mocks.createHabitTrackerRouteContext.mockRejectedValue(
      new HabitTrackerError('Not found', 404)
    );

    const { GET } = await import(
      '@/app/api/v1/workspaces/[wsId]/habit-trackers/route'
    );

    const response = await GET(
      new NextRequest('http://localhost/api/v1/workspaces/ws-1/habit-trackers'),
      {
        params: Promise.resolve({ wsId: 'ws-1' }),
      }
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: 'Not found' });
  });
});
