import { describe, expect, it, vi } from 'vitest';
import {
  getMiraGlobalStop,
  listMiraAuditEvents,
  listMiraOperatorTenants,
  miraGlobalStopRequestSchema,
  miraOperatorStopSchema,
  setMiraOperatorStop,
} from './infrastructure/mira';
import {
  miraConnectSchemas,
  miraSettingsPatchSchema,
  miraTenantStopSchema,
  miraUsageQuerySchema,
} from './mira-channels';

const WS = 'ac000000-0000-4000-8000-0000000000a1';

describe('Mira tenant contracts', () => {
  it('accepts known settings and rejects unknown keys', () => {
    expect(
      miraSettingsPatchSchema.safeParse({
        expectedConfigVersion: 2,
        settings: { enabled: true, dailyCapMicroUsd: 5_000_000 },
      }).success
    ).toBe(true);
    expect(
      miraSettingsPatchSchema.safeParse({
        expectedConfigVersion: 2,
        settings: { apiKey: 'x' },
      }).success
    ).toBe(false);
    expect(
      miraSettingsPatchSchema.safeParse({
        expectedConfigVersion: 2,
        settings: { dailyCapMicroUsd: 1.5 },
      }).success
    ).toBe(false);
  });

  it('requires an expected generation and carries no reason on tenant stops', () => {
    expect(miraTenantStopSchema.safeParse({ stopped: true }).success).toBe(
      false
    );
    expect(
      miraTenantStopSchema.safeParse({
        stopped: true,
        expectedGeneration: 1,
        reason: 'operator',
      }).success
    ).toBe(false);
  });

  it('never accepts personal-account connects', () => {
    expect(
      miraConnectSchemas.zalo.safeParse({ mode: 'personal', token: 'x' })
        .success
    ).toBe(false);
    expect(
      miraConnectSchemas.whatsapp.safeParse({ mode: 'personal', code: 'x' })
        .success
    ).toBe(false);
    expect(
      miraConnectSchemas.zalo.safeParse({ mode: 'bot', token: 'bot-token' })
        .success
    ).toBe(true);
  });

  it('bounds usage ranges to 400 days', () => {
    expect(
      miraUsageQuerySchema.safeParse({ from: '2026-01-01', to: '2026-11-21' })
        .success
    ).toBe(true);
    expect(
      miraUsageQuerySchema.safeParse({ from: '2025-01-01', to: '2026-11-21' })
        .success
    ).toBe(false);
    expect(
      miraUsageQuerySchema.safeParse({ from: '2026-11-21', to: '2026-11-01' })
        .success
    ).toBe(false);
  });
});

describe('Mira operator contracts', () => {
  it('requires a note of at most 500 characters and an expected generation', () => {
    const base = { stopped: true, expectedGeneration: 3 };
    expect(miraOperatorStopSchema.safeParse(base).success).toBe(false);
    expect(
      miraOperatorStopSchema.safeParse({ ...base, note: '   ' }).success
    ).toBe(false);
    expect(
      miraOperatorStopSchema.safeParse({ ...base, note: 'x'.repeat(501) })
        .success
    ).toBe(false);
    expect(
      miraOperatorStopSchema.safeParse({ ...base, note: 'abuse report' })
        .success
    ).toBe(true);
    expect(
      miraGlobalStopRequestSchema.safeParse({ stopped: true, note: 'x' })
        .success
    ).toBe(false);
  });

  it('builds app-relative paths so the Admin mount can move', async () => {
    const urls: string[] = [];
    const fetch = vi.fn(async (url: string) => {
      urls.push(url);
      return Response.json({});
    });
    const options = { appBaseResolver: (path: string) => path, fetch };

    await listMiraOperatorTenants({ after: WS, limit: 10 }, options);
    await getMiraGlobalStop(options);
    await listMiraAuditEvents({ wsId: WS, before: 9 }, options);
    await setMiraOperatorStop(
      WS,
      { stopped: true, expectedGeneration: 1, note: 'n' },
      options
    );

    for (const url of urls) {
      const { pathname } = new URL(url, 'http://resolved.invalid');
      expect(pathname.startsWith('/api/v1/infrastructure/mira/')).toBe(true);
      expect(url).not.toContain('/admin/');
    }
  });
});
