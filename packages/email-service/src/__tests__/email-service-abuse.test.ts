import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@tuturuuu/utils/abuse-protection', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@tuturuuu/utils/abuse-protection')>();
  return {
    ...actual,
    isIPBlocked: vi.fn(async () => null),
    blockIP: vi.fn(async () => undefined),
  };
});

vi.mock('../email-audit', () => {
  return {
    createAuditRecord: vi.fn(async () => 'audit-1'),
    updateAuditRecord: vi.fn(async () => undefined),
    logEmailAbuseEvent: vi.fn(async () => undefined),
  };
});

describe('EmailService abuse enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('counts send attempts even when provider fails', async () => {
    const { EmailService } = await import('../email-service');

    const service = new EmailService({
      provider: 'ses',
      credentials: {
        type: 'ses',
        region: 'us-east-1',
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
      defaultSource: { name: 'Test', email: 'test@example.com' },
      devMode: false,
    });

    // Avoid dynamic admin client import by setting a (mock) supabase client
    service.setSupabaseClient({} as any);

    const incrementCounters = vi.fn(async () => undefined);

    // Replace internal collaborators with stubs
    (service as any).provider = {
      name: 'test-provider',
      validateCredentials: vi.fn(async () => true),
      send: vi.fn(async () => ({ success: false, error: 'provider failed' })),
    };

    (service as any).rateLimiter = {
      checkRateLimits: vi.fn(async () => ({ allowed: true, remaining: 1 })),
      checkRecipientLimits: vi.fn(async () => new Map()),
      incrementCounters,
    };

    (service as any).blacklistChecker = {
      checkEmails: vi.fn(async () => ({
        allowed: ['a@example.com'],
        blocked: [],
      })),
    };

    const result = await service.send({
      recipients: { to: ['a@example.com'] },
      content: { subject: 'Hello', html: '<p>Hi</p>' },
      metadata: {
        wsId: 'ws-1',
        userId: 'user-1',
        templateType: 'test',
      },
    });

    expect(result.success).toBe(false);
    expect(incrementCounters).toHaveBeenCalledTimes(1);
  });

  it('creates an audit record when blocked by IP', async () => {
    const { isIPBlocked } = await import('@tuturuuu/utils/abuse-protection');
    const { createAuditRecord, updateAuditRecord } = await import(
      '../email-audit'
    );
    const { EmailService } = await import('../email-service');

    vi.mocked(isIPBlocked).mockResolvedValueOnce({
      id: 'block-1',
      blockLevel: 2,
      reason: 'manual',
      expiresAt: new Date(Date.now() + 60_000),
      blockedAt: new Date(Date.now() - 1_000),
    });

    const service = new EmailService({
      provider: 'ses',
      credentials: {
        type: 'ses',
        region: 'us-east-1',
        accessKeyId: 'test',
        secretAccessKey: 'test',
      },
      defaultSource: { name: 'Test', email: 'test@example.com' },
      devMode: false,
    });

    service.setSupabaseClient({} as any);

    // Ensure we don't reach provider send logic
    (service as any).provider = {
      name: 'test-provider',
      validateCredentials: vi.fn(async () => true),
      send: vi.fn(async () => ({
        success: true,
        messageId: 'should-not-send',
      })),
    };

    const result = await service.send({
      recipients: { to: ['a@example.com'] },
      content: { subject: 'Hello', html: '<p>Hi</p>' },
      metadata: {
        wsId: 'ws-1',
        userId: 'user-1',
        templateType: 'test',
        ipAddress: '1.2.3.4',
      },
    });

    expect(result.success).toBe(false);
    expect(result.auditId).toBe('audit-1');
    expect(createAuditRecord).toHaveBeenCalledTimes(1);
    expect(updateAuditRecord).toHaveBeenCalledTimes(1);
  });
});
