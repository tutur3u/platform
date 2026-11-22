import { NextRequest } from 'next/server';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const f = vi.hoisted(() => ({
  send: vi.fn(),
  admin: vi.fn(),
  getUserById: vi.fn(),
  from: vi.fn(),
}));
vi.mock('@tuturuuu/email-service', () => ({ sendWorkspaceEmail: f.send }));
vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: f.admin,
}));
vi.mock('@tuturuuu/utils/abuse-protection', () => ({
  extractIPFromHeaders: () => 'unknown',
  isIPBlocked: vi.fn(),
}));
vi.mock('@/constants/common', () => ({ DEV_MODE: false }));
vi.mock('@/lib/mail/html', () => ({
  sanitizeMailHtml: (html: string) => html,
}));

import { POST } from './route';

const staff = {
  id: 'staff-id',
  email: 'staff@tuturuuu.com',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  identities: [{ provider: 'email', identity_data: {} }],
};
const azure = (tid: string) => ({ provider: 'azure', identity_data: { tid } });
const cases = [
  [
    'foreign identity',
    { ...staff, identities: [azure('foreign')] },
    'approved',
    false,
  ],
  [
    'missing configuration',
    { ...staff, identities: [azure('approved')] },
    undefined,
    false,
  ],
  [
    'approved identity',
    { ...staff, identities: [azure('approved')] },
    'approved',
    true,
  ],
  ['confirmed non-Azure', staff, undefined, true],
  [
    'confirmed xwf',
    { ...staff, email: 'staff@xwf.tuturuuu.com' },
    undefined,
    true,
  ],
  [
    'unconfirmed email',
    { ...staff, email_confirmed_at: undefined },
    'approved',
    false,
  ],
  [
    'lookalike domain',
    { ...staff, email: 'staff@tuturuuu.com.example' },
    'approved',
    false,
  ],
] as const;

beforeEach(() => {
  vi.clearAllMocks();
  f.send.mockResolvedValue({ success: true });
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
    insert: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.insert.mockReturnValue(query);
  query.single.mockResolvedValue({
    data: {
      ...staff,
      user_id: staff.id,
      display_name: 'Staff',
      allowed_emails: null,
    },
    error: null,
  });
  f.from.mockReturnValue(query);
  f.admin.mockResolvedValue({
    from: f.from,
    schema: () => ({ from: f.from }),
    auth: { admin: { getUserById: f.getUserById } },
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function sendRequest(wsId: string, recipient: string) {
  return POST(
    new NextRequest('https://mail.test/api/send', {
      method: 'POST',
      body: JSON.stringify({
        mail: {
          to: [recipient],
          subject: 'Test',
          content: '<p>Test</p>',
        },
        config: {
          accessKeyId: 'synthetic-key',
          accessKeySecret: 'synthetic-secret',
        },
      }),
    }),
    { params: Promise.resolve({ wsId }) }
  );
}

it.each(cases)('%s', async (_name, user, configured, allowed) => {
  vi.stubEnv('TUTURUUU_AZURE_TENANT_ID', configured);
  f.getUserById.mockResolvedValue({ data: { user }, error: null });
  const response = await sendRequest('workspace-id', 'recipient@example.test');
  expect(response.status).toBe(allowed ? 200 : 403);
  if (!allowed) {
    expect(f.send).not.toHaveBeenCalled();
    expect(await response.json()).not.toHaveProperty('data');
  }
});

it('logs a blocked count when provider error text includes a recipient', async () => {
  const address = 'person@example.com';
  const wsId = '12345678-1234-1234-1234-123456789abc';
  f.getUserById.mockResolvedValue({ data: { user: staff }, error: null });
  f.send.mockResolvedValue({
    success: false,
    error: 'Provider rejected ' + address,
    blockedRecipients: [address],
  });
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});

  const response = await sendRequest(wsId, address);

  expect(response.status).toBe(500);
  expect(warn).toHaveBeenCalledExactlyOnceWith(
    'Some internal email recipients were blocked',
    { blockedCount: 1, wsId }
  );
  expect(error).toHaveBeenCalledExactlyOnceWith(
    'Internal email sending failed',
    {
      error: {},
      wsId,
    }
  );
  expect(JSON.stringify([...warn.mock.calls, ...error.mock.calls])).not.toMatch(
    /[\w.+-]+@[\w-]+\.[\w.]+/u
  );
});
