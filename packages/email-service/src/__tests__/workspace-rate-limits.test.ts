import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminClientMock } = vi.hoisted(() => ({
  createAdminClientMock: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: createAdminClientMock,
}));

vi.mock('../providers/ses', () => ({
  SESEmailProvider: class {
    name = 'ses';
    validateCredentials = vi.fn(async () => true);
    send = vi.fn(async () => ({ success: true, messageId: 'sent-123' }));
  },
}));

import { EmailService } from '../email-service';
import { getWorkspaceEmailRateLimitOverrides } from '../workspace-rate-limits';

describe('workspace email rate limit overrides', () => {
  const credentials = {
    access_id: 'access-key',
    access_key: 'secret-key',
    region: 'ap-southeast-1',
    source_email: 'ops@example.com',
    source_name: 'Ops',
  };

  let workspaceSecrets: Array<{ name: string; value: string }>;

  beforeEach(() => {
    vi.clearAllMocks();
    workspaceSecrets = [];

    createAdminClientMock.mockResolvedValue({
      from: vi.fn((table: string) => {
        if (table === 'workspace_email_credentials') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi
                  .fn()
                  .mockResolvedValue({ data: credentials, error: null }),
              })),
            })),
          };
        }

        if (table === 'workspace_secrets') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                in: vi
                  .fn()
                  .mockResolvedValue({ data: workspaceSecrets, error: null }),
              })),
            })),
          };
        }

        throw new Error(`Unexpected table: ${table}`);
      }),
    });
  });

  it('parses supported workspace secret rate limit overrides', async () => {
    workspaceSecrets = [
      { name: 'EMAIL_RATE_LIMIT_MINUTE', value: '120' },
      { name: 'INVITE_RATE_LIMIT_HOUR', value: '250' },
      { name: 'EMAIL_RATE_LIMIT_IP_MINUTE', value: 'not-a-number' },
      { name: 'EMAIL_RATE_LIMIT_DAY', value: '-5' },
    ];

    const supabase = await createAdminClientMock();
    const overrides = await getWorkspaceEmailRateLimitOverrides(
      supabase,
      'ws-1'
    );

    expect(overrides).toEqual({
      invitePerHour: 250,
      workspacePerMinute: 120,
    });
  });

  it('applies workspace secret overrides when creating an email service', async () => {
    workspaceSecrets = [
      { name: 'EMAIL_RATE_LIMIT_MINUTE', value: '120' },
      { name: 'INVITE_RATE_LIMIT_HOUR', value: '250' },
    ];

    const service = await EmailService.fromWorkspace('ws-1', {
      rateLimits: {
        userPerHour: 777,
        workspacePerMinute: 999,
      },
    });

    const config = (service as any).rateLimiter.config;

    expect(config.workspacePerMinute).toBe(120);
    expect(config.invitePerHour).toBe(250);
    expect(config.userPerHour).toBe(777);
  });
});
