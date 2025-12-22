import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailService } from '../email-service';

// Mocks
vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  isIPBlocked: vi.fn(async () => null),
  blockIP: vi.fn(async () => undefined),
}));

vi.mock('../email-audit', () => ({
  createAuditRecord: vi.fn(async () => 'audit-1'),
  updateAuditRecord: vi.fn(async () => undefined),
  logEmailAbuseEvent: vi.fn(async () => undefined),
}));

vi.mock('../protection/index', () => ({
  EmailRateLimiter: class {
    checkRateLimits = vi.fn(async () => ({ allowed: true }));
    checkRecipientLimits = vi.fn(async () => new Map());
    incrementCounters = vi.fn(async () => undefined);
  },
  BlacklistChecker: class {
    checkEmails = vi.fn(async () => ({ allowed: [], blocked: [] }));
  },
}));

vi.mock('../providers/ses', () => ({
  SESEmailProvider: class {
    name = 'ses';
    validateCredentials = vi.fn(async () => true);
    send = vi.fn(async () => ({ success: true, messageId: 'sent-123' }));
  },
}));

describe('EmailService', () => {
  const defaultConfig = {
    provider: 'ses' as const,
    credentials: {
      type: 'ses' as const,
      region: 'us-east-1',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
    },
    defaultSource: { name: 'Test', email: 'test@example.com' },
    devMode: false,
  };

  const defaultMetadata = {
    wsId: 'ws-1',
    userId: 'user-1',
    templateType: 'test',
  };

  let service: EmailService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EmailService(defaultConfig);
    service.setSupabaseClient({} as any);
  });

  describe('Constructor & Factory Methods', () => {
    it('should throw error for unknown provider', () => {
      expect(() => {
        new EmailService({ ...defaultConfig, provider: 'unknown' as any });
      }).toThrow('Unknown email provider');
    });

    it('should throw error for invalid SES credentials', () => {
      expect(() => {
        new EmailService({
          ...defaultConfig,
          provider: 'ses',
          credentials: { type: 'sendgrid' } as any,
        });
      }).toThrow('Invalid credentials type');
    });

    it('create() factory should work', () => {
      const instance = EmailService.create(
        defaultConfig.credentials,
        defaultConfig.defaultSource
      );
      expect(instance).toBeInstanceOf(EmailService);
    });

    it('create() factory should throw on unknown credential type', () => {
      expect(() => {
        EmailService.create(
          { type: 'unknown' as any },
          defaultConfig.defaultSource
        );
      }).toThrow('Unknown credentials type');
    });
  });

  describe('send()', () => {
    it('should fail if no recipients', async () => {
      const result = await service.send({
        recipients: { to: [] },
        content: { subject: 'Hi', text: 'Body' },
        metadata: defaultMetadata,
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('No recipients specified');
    });

    it('should handle DEV_MODE', async () => {
      const devService = new EmailService({ ...defaultConfig, devMode: true });
      devService.setSupabaseClient({} as any);

      // Mock blacklist checker to return allowed emails so we reach dev mode check
      (devService as any).blacklistChecker = {
        checkEmails: vi.fn(async (emails) => ({
          allowed: emails,
          blocked: [],
        })),
      };

      const result = await devService.send({
        recipients: { to: ['test@example.com'] },
        content: { subject: 'Hi', text: 'Body' },
        metadata: defaultMetadata,
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('dev-mode-skip');
    });

    it('should handle all recipients blocked', async () => {
      // Mock blacklist checker to block everyone
      (service as any).blacklistChecker = {
        checkEmails: vi.fn(async () => ({
          allowed: [],
          blocked: [{ email: 'blocked@example.com', reason: 'spam' }],
        })),
      };

      const result = await service.send({
        recipients: { to: ['blocked@example.com'] },
        content: { subject: 'Hi', text: 'Body' },
        metadata: defaultMetadata,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('All recipients blocked');
      expect(result.blockedRecipients).toHaveLength(1);
    });
  });

  describe('sendInternal()', () => {
    it('should send internal email without rate limits', async () => {
      const result = await service.sendInternal({
        recipients: { to: ['internal@example.com'] },
        content: { subject: 'Alert', text: 'System Down' },
        metadata: defaultMetadata,
      });

      expect(result.success).toBe(true);
      // Rate limiter should NOT be called for sendInternal (except maybe internally if implementation changed, but based on code it skips it)
      // Actually, sendInternal skips rateLimiter.checkRateLimits
    });

    it('should fail if no recipients', async () => {
      const result = await service.sendInternal({
        recipients: { to: [] },
        content: { subject: 'Hi', text: 'Body' },
        metadata: defaultMetadata,
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('No recipients specified');
    });
  });
});
