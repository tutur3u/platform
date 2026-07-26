import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAdminClient: vi.fn(),
  resolveWorkspaceExternalProjectBinding: vi.fn(),
  sendWorkspaceEmail: vi.fn(),
  verifyExternalAppSecret: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: () => mocks.createAdminClient(),
}));

vi.mock('@tuturuuu/email-service', () => ({
  sendWorkspaceEmail: (...args: Parameters<typeof mocks.sendWorkspaceEmail>) =>
    mocks.sendWorkspaceEmail(...args),
}));

vi.mock('@/lib/app-coordination/external-apps', () => ({
  verifyExternalAppSecret: (
    ...args: Parameters<typeof mocks.verifyExternalAppSecret>
  ) => mocks.verifyExternalAppSecret(...args),
}));

vi.mock('@/lib/external-projects/access', () => ({
  resolveWorkspaceExternalProjectBinding: (
    ...args: Parameters<typeof mocks.resolveWorkspaceExternalProjectBinding>
  ) => mocks.resolveWorkspaceExternalProjectBinding(...args),
}));

const WS = 'e7ff0d3f-5260-420c-989f-58ffa9843724';
const params = { params: Promise.resolve({ wsId: WS }) };

/** Admin double whose only job is to report how many emails already went out. */
function adminWithSentCount(count: number) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          like: () => ({
            gte: async () => ({ count, error: null }),
          }),
        }),
      }),
    }),
  };
}

function request(
  body: unknown,
  headers: Record<string, string> = {
    'x-app-id': 'richfield',
    'x-app-secret': 'secret',
  }
) {
  return new Request(
    `https://tuturuuu.com/api/v1/workspaces/${WS}/external-projects/emails`,
    {
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json', ...headers },
      method: 'POST',
    }
  );
}

const validBody = {
  subject: 'New enquiry',
  text: 'Someone wrote in.',
  to: ['inbox@richfield.test'],
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createAdminClient.mockResolvedValue(adminWithSentCount(0));
  mocks.verifyExternalAppSecret.mockResolvedValue({
    app: { id: 'richfield' },
    ok: true,
  });
  mocks.resolveWorkspaceExternalProjectBinding.mockResolvedValue({
    adapter: 'richfield',
    enabled: true,
  });
  mocks.sendWorkspaceEmail.mockResolvedValue({
    auditId: 'audit-1',
    messageId: 'ses-1',
    success: true,
  });
});

describe('POST external-project emails', () => {
  it('refuses a request with no app secret', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      request(validBody, { 'x-app-id': 'richfield' }),
      params
    );

    expect(response.status).toBe(401);
    expect(mocks.sendWorkspaceEmail).not.toHaveBeenCalled();
  });

  it('refuses an app that is not the one bound to the workspace', async () => {
    mocks.resolveWorkspaceExternalProjectBinding.mockResolvedValue({
      adapter: 'yashie',
      enabled: true,
    });
    const { POST } = await import('./route');

    const response = await POST(request(validBody), params);

    expect(response.status).toBe(403);
    expect(mocks.sendWorkspaceEmail).not.toHaveBeenCalled();
  });

  it('sends through the workspace mailer and attributes the calling app', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      request({
        ...validBody,
        entityId: 'entry-1',
        replyTo: ['sender@acme.test'],
      }),
      params
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      auditId: 'audit-1',
      budget: { remainingVnd: 19_975, sent: 1, spentVnd: 25 },
      messageId: 'ses-1',
      success: true,
    });

    const [wsId, sent] = mocks.sendWorkspaceEmail.mock.calls[0] ?? [];
    expect(wsId).toBe(WS);
    expect(sent.recipients.to).toEqual(['inbox@richfield.test']);
    expect(sent.content.replyTo).toEqual(['sender@acme.test']);
    expect(sent.metadata.templateType).toBe('external-project:richfield');
    expect(sent.metadata.entityId).toBe('entry-1');
  });

  it('escapes text when wrapping it into the html part', async () => {
    const { POST } = await import('./route');

    await POST(
      request({
        ...validBody,
        text: 'Message: <script>alert(1)</script> & "quoted"',
      }),
      params
    );

    const [, sent] = mocks.sendWorkspaceEmail.mock.calls[0] ?? [];
    // The body carries whatever a visitor typed into a public form, so it must
    // never reach the recipient's client as live markup.
    expect(sent.content.html).not.toContain('<script>');
    expect(sent.content.html).toContain('&lt;script&gt;');
    expect(sent.content.html).toContain('&amp;');
    expect(sent.content.text).toContain('<script>');
  });

  it('rejects a payload with neither text nor html', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      request({ subject: 'Empty', to: ['inbox@richfield.test'] }),
      params
    );

    expect(response.status).toBe(400);
    expect(mocks.sendWorkspaceEmail).not.toHaveBeenCalled();
  });

  it('rejects an oversized recipient list rather than becoming a bulk channel', async () => {
    const { POST } = await import('./route');

    const response = await POST(
      request({
        ...validBody,
        to: Array.from({ length: 6 }, (_, i) => `person${i}@richfield.test`),
      }),
      params
    );

    expect(response.status).toBe(400);
    expect(mocks.sendWorkspaceEmail).not.toHaveBeenCalled();
  });

  it('refuses to send once the monthly budget is exhausted', async () => {
    // 800 emails at 25₫ is the whole 20,000₫ allowance.
    mocks.createAdminClient.mockResolvedValue(adminWithSentCount(800));
    const { POST } = await import('./route');

    const response = await POST(request(validBody), params);

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toMatchObject({
      budget: { budgetVnd: 20_000, remainingVnd: 0, spentVnd: 20_000 },
    });
    // The cap must be refused before spending, not detected afterwards.
    expect(mocks.sendWorkspaceEmail).not.toHaveBeenCalled();
  });

  it('still sends the email that lands exactly on the cap', async () => {
    mocks.createAdminClient.mockResolvedValue(adminWithSentCount(799));
    const { POST } = await import('./route');

    const response = await POST(request(validBody), params);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      budget: { remainingVnd: 0, sent: 800, spentVnd: 20_000 },
    });
    expect(mocks.sendWorkspaceEmail).toHaveBeenCalledTimes(1);
  });

  it('surfaces a mailer failure as 502 with the blocked recipients', async () => {
    mocks.sendWorkspaceEmail.mockResolvedValue({
      blockedRecipients: [
        { email: 'inbox@richfield.test', reason: 'blacklist' },
      ],
      error: 'Recipient blocked',
      success: false,
    });
    const { POST } = await import('./route');

    const response = await POST(request(validBody), params);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      error: 'Recipient blocked',
    });
  });
});
