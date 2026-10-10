import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailService } from '../email-service';
import { BlacklistChecker } from '../protection/blacklist-checker';

const providerSend = vi.hoisted(() => vi.fn());

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
    send = providerSend;
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
  const originalSendProductionEmail = process.env.SEND_PRODUCTION_EMAIL;

  beforeEach(() => {
    vi.clearAllMocks();
    providerSend
      .mockReset()
      .mockResolvedValue({ success: true, messageId: 'sent-123' });
    if (originalSendProductionEmail === undefined) {
      delete process.env.SEND_PRODUCTION_EMAIL;
    } else {
      process.env.SEND_PRODUCTION_EMAIL = originalSendProductionEmail;
    }
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
          { type: 'unknown' as any, apiKey: 'key' },
          defaultConfig.defaultSource
        );
      }).toThrow('Unknown credentials type');
    });
  });

  it.each(['send', 'sendInternal'] as const)(
    'propagates classified unknown provider outcome through %s',
    async (method) => {
      Reflect.set(service, 'blacklistChecker', {
        checkEmails: async (emails: string[]) => ({
          allowed: emails,
          blocked: [],
        }),
      });
      providerSend.mockResolvedValue({
        success: false,
        deliveryOutcome: 'unknown',
        error:
          'Email delivery outcome is unknown. Check provider logs before retrying.',
      });
      const result = await service[method]({
        recipients: { to: ['synthetic@example.com'] },
        content: {
          html: '<p>Synthetic report</p>',
          subject: 'Synthetic report',
        },
        metadata: defaultMetadata,
      });
      expect(result).toMatchObject({
        success: false,
        deliveryOutcome: 'unknown',
      });
      expect(result.messageId).toBeUndefined();
      expect(providerSend).toHaveBeenCalledOnce();
    }
  );

  describe('authoritative suppression lookup', () => {
    const recipient = 'Synthetic@Example.com';
    const negative = {
      email: 'synthetic@example.com',
      is_blocked: false,
      reason: null,
    };
    const unavailableCases = [
      ['RPC error', { data: [negative], error: { message: 'private detail' } }],
      ['null response', { data: null, error: null }],
      ['non-array response', { data: {}, error: null }],
      ['missing recipient', { data: [], error: null }],
      ['missing second recipient', { data: [negative], error: null }],
      ['duplicate recipient', { data: [negative, negative], error: null }],
      [
        'foreign recipient',
        { data: [{ ...negative, email: 'foreign@example.com' }], error: null },
      ],
      ['null row', { data: [null], error: null }],
      ['array row', { data: [[]], error: null }],
      ['missing email', { data: [{ is_blocked: false }], error: null }],
      [
        'non-boolean status',
        { data: [{ ...negative, is_blocked: 0 }], error: null },
      ],
      ['missing status', { data: [{ email: negative.email }], error: null }],
      [
        'malformed reason',
        { data: [{ ...negative, reason: {} }], error: null },
      ],
    ] as const;

    it.each(unavailableCases)(
      'stops before the provider for %s',
      async (name, response) => {
        const rpc = vi.fn().mockResolvedValue(response);
        service.setSupabaseClient({ rpc } as never);
        Reflect.set(service, 'blacklistChecker', new BlacklistChecker());
        const to =
          name === 'missing second recipient'
            ? [recipient, 'another@example.com']
            : [recipient];
        await expect(
          service.send({
            recipients: { to },
            content: { subject: 'Synthetic', html: '<p>Synthetic</p>' },
            metadata: defaultMetadata,
          })
        ).rejects.toThrow(
          'Email suppression lookup unavailable. Try again later.'
        );
        expect(providerSend).not.toHaveBeenCalled();
      }
    );

    it('stops before the provider if the lookup throws', async () => {
      const rpc = vi.fn().mockRejectedValue(new Error('private detail'));
      service.setSupabaseClient({ rpc } as never);
      Reflect.set(service, 'blacklistChecker', new BlacklistChecker());
      await expect(
        service.send({
          recipients: { to: [recipient] },
          content: { subject: 'Synthetic', html: '<p>Synthetic</p>' },
          metadata: defaultMetadata,
        })
      ).rejects.toThrow(
        'Email suppression lookup unavailable. Try again later.'
      );
      expect(providerSend).not.toHaveBeenCalled();
    });

    it('sends only after an explicit complete negative lookup', async () => {
      const rpc = vi.fn().mockResolvedValue({ data: [negative], error: null });
      service.setSupabaseClient({ rpc } as never);
      Reflect.set(service, 'blacklistChecker', new BlacklistChecker());
      const result = await service.send({
        recipients: { to: [recipient, recipient.toLowerCase()] },
        content: { subject: 'Synthetic', html: '<p>Synthetic</p>' },
        metadata: defaultMetadata,
      });
      expect(result.success).toBe(true);
      expect(providerSend).toHaveBeenCalledOnce();
      expect(rpc).toHaveBeenCalledWith('get_email_block_statuses', {
        p_emails: ['synthetic@example.com'],
      });
    });

    it('blocks known suppression for all original recipient spellings', async () => {
      service.setSupabaseClient({
        rpc: vi.fn().mockResolvedValue({
          data: [{ ...negative, is_blocked: true }],
          error: null,
        }),
      } as never);
      Reflect.set(service, 'blacklistChecker', new BlacklistChecker());
      const result = await service.send({
        recipients: { to: [recipient, recipient.toLowerCase()] },
        content: { subject: 'Synthetic', html: '<p>Synthetic</p>' },
        metadata: defaultMetadata,
      });
      expect(result.success).toBe(false);
      expect(result.blockedRecipients?.map((item) => item.email)).toEqual([
        recipient,
        recipient.toLowerCase(),
      ]);
      expect(providerSend).not.toHaveBeenCalled();
    });

    it.each([null, 0, 'false', undefined])(
      'rejects a non-boolean single-recipient response %s',
      async (data) => {
        const checker = new BlacklistChecker();
        await expect(
          checker.checkSingle(recipient, {
            rpc: vi.fn().mockResolvedValue({ data, error: null }),
          } as never)
        ).rejects.toThrow(
          'Email suppression lookup unavailable. Try again later.'
        );
      }
    );

    it('preserves explicit single-recipient allow and block outcomes', async () => {
      const checker = new BlacklistChecker();
      const rpc = vi
        .fn()
        .mockResolvedValueOnce({ data: false, error: null })
        .mockResolvedValueOnce({ data: true, error: null });
      expect(await checker.checkSingle(recipient, { rpc } as never)).toEqual({
        allowed: true,
      });
      expect(await checker.checkSingle(recipient, { rpc } as never)).toEqual({
        allowed: false,
        reason: 'Email is blacklisted',
      });
    });
  });

  describe('send()', () => {
    it('should fail if no recipients', async () => {
      const result = await service.send({
        recipients: { to: [] },
        content: { subject: 'Hi', text: 'Body', html: '<p>Body</p>' },
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
        content: { subject: 'Hi', text: 'Body', html: '<p>Body</p>' },
        metadata: defaultMetadata,
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('dev-mode-skip');
    });

    it('should send real email in DEV_MODE when SEND_PRODUCTION_EMAIL=true', async () => {
      process.env.SEND_PRODUCTION_EMAIL = 'true';

      const devService = new EmailService({ ...defaultConfig, devMode: true });
      devService.setSupabaseClient({} as any);
      (devService as any).blacklistChecker = {
        checkEmails: vi.fn(async (emails) => ({
          allowed: emails,
          blocked: [],
        })),
      };

      const sendSpy = vi.spyOn((devService as any).provider, 'send');

      const result = await devService.send({
        recipients: { to: ['test@example.com'] },
        content: { subject: 'Hi', text: 'Body', html: '<p>Body</p>' },
        metadata: defaultMetadata,
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('sent-123');
      expect(sendSpy).toHaveBeenCalledOnce();
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
        content: { subject: 'Hi', text: 'Body', html: '<p>Body</p>' },
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
        content: {
          subject: 'Alert',
          text: 'System Down',
          html: '<p>System Down</p>',
        },
        metadata: defaultMetadata,
      });

      expect(result.success).toBe(true);
      // Rate limiter should NOT be called for sendInternal (except maybe internally if implementation changed, but based on code it skips it)
      // Actually, sendInternal skips rateLimiter.checkRateLimits
    });

    it('should fail if no recipients', async () => {
      const result = await service.sendInternal({
        recipients: { to: [] },
        content: { subject: 'Hi', text: 'Body', html: '<p>Body</p>' },
        metadata: defaultMetadata,
      });
      expect(result.success).toBe(false);
      expect(result.error).toBe('No recipients specified');
    });

    it('should send internal email in DEV_MODE when SEND_PRODUCTION_EMAIL=true', async () => {
      process.env.SEND_PRODUCTION_EMAIL = 'true';

      const devService = new EmailService({ ...defaultConfig, devMode: true });
      devService.setSupabaseClient({} as any);
      (devService as any).blacklistChecker = {
        checkEmails: vi.fn(async (emails) => ({
          allowed: emails,
          blocked: [],
        })),
      };

      const sendSpy = vi.spyOn((devService as any).provider, 'send');

      const result = await devService.sendInternal({
        recipients: { to: ['internal@example.com'] },
        content: {
          subject: 'Alert',
          text: 'System Down',
          html: '<p>System Down</p>',
        },
        metadata: defaultMetadata,
      });

      expect(result.success).toBe(true);
      expect(result.messageId).toBe('sent-123');
      expect(sendSpy).toHaveBeenCalledOnce();
    });
  });
});
