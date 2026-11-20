import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

/**
 * Source-aware loaders for the Infrastructure executive view.
 *
 * Unlike the legacy `data-fetching.ts` helpers (which return zeroed fallbacks
 * on failure), every loader here reports whether its source actually answered,
 * so the executive view never presents a failed query as a real zero.
 */

export type SourceResult<T> =
  | { status: 'ok'; data: T }
  | { status: 'unavailable' };

export interface ExecutiveEngagement {
  dau: number;
  wau: number;
  mau: number;
}

export interface ExecutiveGrowth {
  totalUsers: number;
  usersThisWeek: number;
  usersThisMonth: number;
  growthRateWeekly: number | null;
  growthRateMonthly: number | null;
}

export interface ExecutiveWorkspaces {
  totalWorkspaces: number;
  activeWorkspaces: number;
  emptyWorkspaces: number;
  createdThisMonth: number;
}

export interface ExecutiveDeviceShare {
  deviceType: string;
  sessionCount: number;
  percentage: number;
}

export interface ExecutiveAiCredits {
  workspacesWithBalance: number;
  usersWithBalance: number;
  creditsConsumed: number;
  creditsAllocated: number;
  bonusCredits: number;
}

export interface ExecutiveSnapshot {
  aiCredits: SourceResult<ExecutiveAiCredits>;
  devices: SourceResult<ExecutiveDeviceShare[]>;
  engagement: SourceResult<ExecutiveEngagement>;
  growth: SourceResult<ExecutiveGrowth>;
  workspaces: SourceResult<ExecutiveWorkspaces>;
}

const UNAVAILABLE = { status: 'unavailable' } as const;

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function firstRow(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) {
    return (data[0] as Record<string, unknown> | undefined) ?? null;
  }
  return data && typeof data === 'object'
    ? (data as Record<string, unknown>)
    : null;
}

async function guard<T>(
  label: string,
  load: () => Promise<T | null>
): Promise<SourceResult<T>> {
  try {
    const data = await load();
    return data === null ? UNAVAILABLE : { status: 'ok', data };
  } catch (error) {
    console.error(`Infrastructure executive source failed: ${label}`, error);
    return UNAVAILABLE;
  }
}

export async function loadExecutiveSnapshot(
  createClient: () => Promise<TypedSupabaseClient> = async () =>
    (await createAdminClient()) as TypedSupabaseClient
): Promise<ExecutiveSnapshot> {
  let sb: TypedSupabaseClient;
  try {
    sb = await createClient();
  } catch (error) {
    console.error('Infrastructure executive admin client unavailable', error);
    return {
      aiCredits: UNAVAILABLE,
      devices: UNAVAILABLE,
      engagement: UNAVAILABLE,
      growth: UNAVAILABLE,
      workspaces: UNAVAILABLE,
    };
  }

  const [engagement, growth, workspaces, devices, aiCredits] =
    await Promise.all([
      guard('engagement', async () => {
        const [dau, wau, mau] = await Promise.all([
          sb.rpc('get_dau_count'),
          sb.rpc('get_wau_count'),
          sb.rpc('get_mau_count'),
        ]);
        if (dau.error || wau.error || mau.error) {
          throw dau.error ?? wau.error ?? mau.error;
        }
        return {
          dau: toNumber(dau.data),
          wau: toNumber(wau.data),
          mau: toNumber(mau.data),
        };
      }),
      guard('growth', async () => {
        const { data, error } = await sb.rpc('get_user_growth_comparison');
        if (error) throw error;
        const row = firstRow(data);
        if (!row) return null;
        return {
          totalUsers: toNumber(row.total_users),
          usersThisWeek: toNumber(row.users_this_week),
          usersThisMonth: toNumber(row.users_this_month),
          growthRateWeekly: toNullableNumber(row.growth_rate_weekly),
          growthRateMonthly: toNullableNumber(row.growth_rate_monthly),
        };
      }),
      guard('workspaces', async () => {
        const { data, error } = await sb.rpc('get_workspace_statistics');
        if (error) throw error;
        const row = firstRow(data);
        if (!row) return null;
        return {
          totalWorkspaces: toNumber(row.total_workspaces),
          activeWorkspaces: toNumber(row.active_workspaces),
          emptyWorkspaces: toNumber(row.empty_workspace_count),
          createdThisMonth: toNumber(row.workspaces_created_this_month),
        };
      }),
      guard('devices', async () => {
        const { data, error } = await sb.rpc('get_sessions_by_device');
        if (error) throw error;
        if (!Array.isArray(data)) return null;
        return data.map((item) => ({
          deviceType: String(item.device_type ?? ''),
          sessionCount: toNumber(item.session_count),
          percentage: toNumber(item.percentage),
        }));
      }),
      guard('ai-credits', async () => {
        const { data, error } = await sb.rpc('get_platform_ai_credit_overview');
        if (error) throw error;
        const row = firstRow(data);
        if (!row) return null;
        return {
          workspacesWithBalance: toNumber(row.total_workspaces_with_balance),
          usersWithBalance: toNumber(row.total_users_with_balance),
          creditsConsumed: toNumber(row.total_credits_consumed),
          creditsAllocated: toNumber(row.total_credits_allocated),
          bonusCredits: toNumber(row.total_bonus_credits),
        };
      }),
    ]);

  return { aiCredits, devices, engagement, growth, workspaces };
}

export interface ExecutiveIndicators {
  /** DAU / MAU as a percentage, or null when MAU is zero or unknown. */
  stickiness: number | null;
  /** Share of sessions classified as mobile by user agent, or null. */
  mobileSessionShare: number | null;
  /** Credits consumed / allocated as a percentage, or null. */
  creditUtilization: number | null;
  /** Active workspaces / total workspaces as a percentage, or null. */
  workspaceActivation: number | null;
}

function ratio(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(denominator) || denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

export function deriveExecutiveIndicators(
  snapshot: ExecutiveSnapshot
): ExecutiveIndicators {
  const { aiCredits, devices, engagement, workspaces } = snapshot;

  let mobileSessionShare: number | null = null;
  if (devices.status === 'ok') {
    const total = devices.data.reduce((sum, d) => sum + d.sessionCount, 0);
    const mobile = devices.data
      .filter((d) => d.deviceType.toLowerCase() === 'mobile')
      .reduce((sum, d) => sum + d.sessionCount, 0);
    mobileSessionShare = ratio(mobile, total);
  }

  return {
    stickiness:
      engagement.status === 'ok'
        ? ratio(engagement.data.dau, engagement.data.mau)
        : null,
    mobileSessionShare,
    creditUtilization:
      aiCredits.status === 'ok'
        ? ratio(aiCredits.data.creditsConsumed, aiCredits.data.creditsAllocated)
        : null,
    workspaceActivation:
      workspaces.status === 'ok'
        ? ratio(
            workspaces.data.activeWorkspaces,
            workspaces.data.totalWorkspaces
          )
        : null,
  };
}
