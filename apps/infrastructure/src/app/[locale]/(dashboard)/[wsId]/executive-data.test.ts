import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
}));

const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

import {
  deriveExecutiveIndicators,
  type ExecutiveSnapshot,
  loadExecutiveSnapshot,
} from './executive-data';

function clientFrom(
  responses: Record<string, { data: unknown; error: unknown }>
) {
  return async () =>
    ({
      rpc: (name: string) =>
        Promise.resolve(
          responses[name] ?? { data: null, error: new Error(`no ${name}`) }
        ),
    }) as unknown as TypedSupabaseClient;
}

const ok = { error: null };

describe('loadExecutiveSnapshot', () => {
  it('maps every verified source when queries succeed', async () => {
    const snapshot = await loadExecutiveSnapshot(
      clientFrom({
        get_dau_count: { ...ok, data: 12 },
        get_wau_count: { ...ok, data: 40 },
        get_mau_count: { ...ok, data: 120 },
        get_user_growth_comparison: {
          ...ok,
          data: [
            {
              total_users: 500,
              users_this_week: 9,
              users_this_month: 30,
              growth_rate_weekly: '2.5',
              growth_rate_monthly: null,
            },
          ],
        },
        get_workspace_statistics: {
          ...ok,
          data: [
            {
              total_workspaces: 80,
              active_workspaces: 20,
              empty_workspace_count: 5,
              workspaces_created_this_month: 3,
            },
          ],
        },
        get_sessions_by_device: {
          ...ok,
          data: [
            { device_type: 'Desktop', session_count: 75, percentage: 75 },
            { device_type: 'Mobile', session_count: 25, percentage: 25 },
          ],
        },
        get_platform_ai_credit_overview: {
          ...ok,
          data: {
            total_workspaces_with_balance: 4,
            total_users_with_balance: 6,
            total_credits_consumed: 250,
            total_credits_allocated: 1000,
            total_bonus_credits: 10,
          },
        },
      })
    );

    expect(snapshot.engagement).toEqual({
      status: 'ok',
      data: { dau: 12, wau: 40, mau: 120 },
    });
    expect(snapshot.growth).toMatchObject({
      status: 'ok',
      data: { growthRateWeekly: 2.5, growthRateMonthly: null },
    });
    expect(snapshot.aiCredits).toMatchObject({
      status: 'ok',
      data: { creditsConsumed: 250, creditsAllocated: 1000 },
    });

    expect(deriveExecutiveIndicators(snapshot)).toEqual({
      stickiness: 10,
      mobileSessionShare: 25,
      creditUtilization: 25,
      workspaceActivation: 25,
    });
  });

  it('reports failed sources as unavailable instead of zero', async () => {
    const snapshot = await loadExecutiveSnapshot(
      clientFrom({
        get_dau_count: { ...ok, data: 1 },
        get_wau_count: { data: null, error: new Error('boom') },
        get_mau_count: { ...ok, data: 1 },
        get_user_growth_comparison: { ...ok, data: [] },
      })
    );

    expect(snapshot.engagement.status).toBe('unavailable');
    expect(snapshot.growth.status).toBe('unavailable');
    expect(snapshot.workspaces.status).toBe('unavailable');
    expect(snapshot.devices.status).toBe('unavailable');
    expect(snapshot.aiCredits.status).toBe('unavailable');
    expect(deriveExecutiveIndicators(snapshot)).toEqual({
      stickiness: null,
      mobileSessionShare: null,
      creditUtilization: null,
      workspaceActivation: null,
    });
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('marks everything unavailable when the admin client cannot be created', async () => {
    const snapshot = await loadExecutiveSnapshot(async () => {
      throw new Error('missing env');
    });

    for (const source of Object.values(snapshot)) {
      expect(source.status).toBe('unavailable');
    }
  });
});

describe('deriveExecutiveIndicators', () => {
  it('returns null ratios for empty denominators', () => {
    const snapshot: ExecutiveSnapshot = {
      engagement: { status: 'ok', data: { dau: 0, wau: 0, mau: 0 } },
      growth: { status: 'unavailable' },
      workspaces: {
        status: 'ok',
        data: {
          totalWorkspaces: 0,
          activeWorkspaces: 0,
          emptyWorkspaces: 0,
          createdThisMonth: 0,
        },
      },
      devices: { status: 'ok', data: [] },
      aiCredits: {
        status: 'ok',
        data: {
          workspacesWithBalance: 0,
          usersWithBalance: 0,
          creditsConsumed: 0,
          creditsAllocated: 0,
          bonusCredits: 0,
        },
      },
    };

    expect(deriveExecutiveIndicators(snapshot)).toEqual({
      stickiness: null,
      mobileSessionShare: null,
      creditUtilization: null,
      workspaceActivation: null,
    });
  });
});
