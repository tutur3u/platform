import { beforeEach, describe, expect, it, vi } from 'vitest';

const verifySecret = vi.fn();
const maybeSingle = vi.fn();
vi.mock('@tuturuuu/utils/workspace-helper', () => ({ verifySecret }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(async () => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({ maybeSingle })),
      })),
    })),
  })),
}));

describe('periodic report email access', () => {
  beforeEach(() => {
    vi.resetModules();
    verifySecret.mockReset();
    maybeSingle.mockReset();
    maybeSingle.mockResolvedValue({ data: { id: 'sender-1' }, error: null });
  });

  it('requires both workspace gates', async () => {
    verifySecret.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const { resolvePeriodicReportEmailAccess } = await import('./access');
    await expect(resolvePeriodicReportEmailAccess('ws-1')).resolves.toEqual({
      allowed: false,
      reason: 'periodic_email_disabled',
    });
  });

  it('allows delivery only when both gates and sender are ready', async () => {
    verifySecret.mockResolvedValue(true);
    const { resolvePeriodicReportEmailAccess } = await import('./access');
    await expect(resolvePeriodicReportEmailAccess('ws-1')).resolves.toEqual({
      allowed: true,
    });
  });
});
