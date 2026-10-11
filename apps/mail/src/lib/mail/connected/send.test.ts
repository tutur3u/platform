import PostalMime from 'postal-mime';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  table: vi.fn(),
  json: vi.fn(),
  request: vi.fn(),
  read: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  receipt: vi.fn(),
  delete: vi.fn(),
  maybeSingle: vi.fn(),
  eq: vi.fn(),
  mutation: vi.fn(),
}));
vi.mock('./repository', () => ({ table: mocks.table }));
vi.mock('./transport', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./transport')>()),
  providerJson: mocks.json,
  providerRequest: mocks.request,
  jsonBody: (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) }),
}));
vi.mock('./messages', () => ({ readMessage: mocks.read }));

import { ConnectedMailError } from './config';
import { composeSchema } from './mime';
import type { ConnectedAccount } from './repository';
import { respondToConnectedInvitation, sendConnectedMessage } from './send';
import { MailProviderResponseError } from './transport';

const account = {
  id: 'account',
  provider: 'google',
  address: 'me@example.test',
} as ConnectedAccount;
const payload = composeSchema.parse({
  requestId: '3b83b485-f740-4e43-9966-a9a63b792a9c',
  to: ['recipient@example.test'],
  subject: 'Hello',
  text: 'Test',
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.insert.mockResolvedValue({ error: null });
  const chain: any = {
    insert: mocks.insert,
    update: mocks.update,
    select: vi.fn(),
    eq: mocks.eq,
    delete: mocks.delete,
    maybeSingle: mocks.maybeSingle,
    single: mocks.receipt,
    // biome-ignore lint/suspicious/noThenProperty: emulate the awaited PostgREST mutation builder
    then: (resolve: (value: unknown) => void) => resolve(mocks.mutation()),
  };
  chain.eq.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  mocks.update.mockReturnValue(chain);
  mocks.delete.mockReturnValue(chain);
  mocks.maybeSingle.mockResolvedValue({
    data: { request_id: payload.requestId },
    error: null,
  });
  mocks.mutation.mockReturnValue({ error: null });
  mocks.table.mockResolvedValue({
    insert: mocks.insert,
    update: mocks.update,
    select: chain.select,
    delete: mocks.delete,
  });
  mocks.json.mockImplementation(
    async (_account, _path, _init, onSubmissionStarted?: () => void) => {
      onSubmissionStarted?.();
      return { id: 'provider-message' };
    }
  );
  mocks.request.mockImplementation(
    async (_account, _path, _init, onSubmissionStarted?: () => void) => {
      onSubmissionStarted?.();
      return new Response(null, { status: 202 });
    }
  );
});
describe('connected send claims', () => {
  it.each(['google', 'microsoft'] as const)(
    '%s sends one MIME message and records acceptance',
    async (provider) => {
      expect(
        await sendConnectedMessage({ ...account, provider }, payload)
      ).toEqual({ status: 'sent' });
      expect(mocks.insert).toHaveBeenCalledTimes(1);
      expect(mocks.update).toHaveBeenCalledWith({ status: 'sent' });
      if (provider === 'google') {
        const body = JSON.parse(mocks.json.mock.calls[0]?.[2].body);
        expect(Buffer.from(body.raw, 'base64url').toString()).toContain(
          'To: recipient@example.test'
        );
      } else {
        expect(mocks.request.mock.calls[0]?.[1]).toBe('/sendMail');
        expect(mocks.request.mock.calls[0]?.[2].headers).toEqual({
          'Content-Type': 'text/plain',
        });
      }
    }
  );
  it('does not replay ambiguous or in-flight sends', async () => {
    mocks.insert.mockResolvedValue({ error: { code: '23505' } });
    mocks.receipt.mockResolvedValue({
      data: { status: 'uncertain', payload_hash: 'different' },
      error: null,
    });
    await expect(sendConnectedMessage(account, payload)).rejects.toMatchObject({
      status: 409,
    });
    expect(mocks.json).not.toHaveBeenCalled();
  });
  it('records uncertainty after a lost provider response without retry', async () => {
    mocks.json.mockImplementationOnce(
      async (_account, _path, _init, onSubmissionStarted?: () => void) => {
        onSubmissionStarted?.();
        throw new Error('Connection lost');
      }
    );
    await expect(sendConnectedMessage(account, payload)).rejects.toThrow(
      'Connection lost'
    );
    expect(mocks.json).toHaveBeenCalledTimes(1);
    expect(mocks.update).toHaveBeenCalledWith({ status: 'uncertain' });
  });
  it('does not contact the provider when claim storage fails', async () => {
    mocks.insert.mockResolvedValue({ error: { code: 'database-error' } });
    await expect(sendConnectedMessage(account, payload)).rejects.toThrow(
      'reserve'
    );
    expect(mocks.json).not.toHaveBeenCalled();
  });
  it('copies only attachments resolved from the current account source and derives reply headers', async () => {
    mocks.read.mockResolvedValue({
      detail: { internetMessageId: '<source@example.test>', references: [] },
      files: [
        {
          filename: 'source.pdf',
          mimeType: 'application/pdf',
          content: new Uint8Array([1, 2, 3]),
        },
      ],
    });
    await sendConnectedMessage(account, {
      ...payload,
      sourceId: 'source',
      mode: 'reply',
      attachmentIds: ['0'],
    });
    expect(mocks.read).toHaveBeenCalledWith(account, 'source', false);
    const raw = Buffer.from(
      JSON.parse(mocks.json.mock.calls[0]?.[2].body).raw,
      'base64url'
    ).toString();
    expect(raw).toContain('In-Reply-To: <source@example.test>');
    expect(raw).toContain('AQID');
  });
  it.each(['ACCEPTED', 'DECLINED', 'TENTATIVE'] as const)(
    'sends %s only to the stored invitation organizer',
    async (response) => {
      mocks.read.mockResolvedValue({
        detail: {
          subject: 'Meeting',
          invitation: {
            uid: 'test',
            sequence: 1,
            organizer: 'host@example.test',
            attendee: account.address,
            summary: 'Meeting',
            timezone: [],
            recurrence: null,
          },
          references: [],
        },
        files: [],
      });
      await respondToConnectedInvitation(
        account,
        'source',
        response,
        payload.requestId
      );
      const raw = Buffer.from(
        JSON.parse(mocks.json.mock.calls[0]?.[2].body).raw,
        'base64url'
      ).toString();
      expect(raw).toContain('To: host@example.test');
      expect(raw).toContain('method=REPLY');
    }
  );
  it('does not send for missing or ambiguous invitations', async () => {
    mocks.read.mockResolvedValue({ detail: { invitation: null } });
    await expect(
      respondToConnectedInvitation(
        account,
        'source',
        'ACCEPTED',
        payload.requestId
      )
    ).rejects.toMatchObject({ status: 409 });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
it('completed replays acknowledge the receipt without resending', async () => {
  const { createHash } = await import('node:crypto');
  mocks.insert.mockResolvedValue({ error: { code: '23505' } });
  mocks.receipt.mockResolvedValue({
    data: {
      status: 'sent',
      payload_hash: createHash('sha256')
        .update(JSON.stringify(payload))
        .digest('hex'),
    },
    error: null,
  });
  expect(await sendConnectedMessage(account, payload)).toEqual({
    status: 'sent',
  });
  expect(mocks.json).not.toHaveBeenCalled();
});
it('Gmail updates the selected native draft instead of creating a second copy', async () => {
  const { saveDraft } = await import('./send');
  mocks.read.mockResolvedValue({ detail: {}, files: [] });
  await saveDraft(account, { ...payload, draftId: 'draft/a' });
  expect(mocks.json.mock.calls[0]?.[1]).toBe('/drafts/draft%2Fa');
});
it('Outlook retains the original when replacement creation is not confirmed', async () => {
  const { saveDraft } = await import('./send');
  mocks.read.mockResolvedValue({ detail: {}, files: [] });
  mocks.json
    .mockResolvedValueOnce({ isDraft: true, '@odata.etag': 'version' })
    .mockResolvedValueOnce({});
  await expect(
    saveDraft(
      { ...account, provider: 'microsoft' },
      { ...payload, draftId: 'original' }
    )
  ).rejects.toMatchObject({ status: 502 });
  expect(mocks.request).not.toHaveBeenCalled();
});
it('Outlook creates the replacement before fenced deletion of the original draft', async () => {
  const { saveDraft } = await import('./send');
  mocks.read.mockResolvedValue({ detail: {}, files: [] });
  mocks.json
    .mockResolvedValueOnce({ isDraft: true, '@odata.etag': 'version' })
    .mockResolvedValueOnce({ id: 'replacement' });
  await saveDraft(
    { ...account, provider: 'microsoft' },
    { ...payload, draftId: 'original' }
  );
  expect(mocks.request).toHaveBeenCalledWith(
    expect.anything(),
    '/messages/original',
    { method: 'DELETE', headers: { 'If-Match': 'version' } }
  );
});

it('editing a provider draft preserves original HTML, inline image identity, and threading', async () => {
  const { saveDraft } = await import('./send');
  const html =
    '<p style="color:red">Original</p><img src="cid:logo@example.test">';
  mocks.read.mockResolvedValue({
    detail: { text: 'Test', references: ['<parent@example.test>'] },
    originalHtml: html,
    originalInReplyTo: '<parent@example.test>',
    files: [
      {
        filename: 'logo.png',
        mimeType: 'image/png',
        contentId: '<logo@example.test>',
        content: new Uint8Array([1, 2, 3]),
      },
    ],
  });
  await saveDraft(account, {
    ...payload,
    draftId: 'draft',
    html: '<p>sanitized preview</p>',
    attachmentIds: ['0'],
  });
  const body = JSON.parse(mocks.json.mock.calls[0]![2].body);
  const parsed = await PostalMime.parse(
    Buffer.from(body.message.raw, 'base64url')
  );
  expect(parsed.html?.trim()).toBe(html);
  expect(parsed.inReplyTo).toBe('<parent@example.test>');
  expect(parsed.references).toBe('<parent@example.test>');
  expect(parsed.attachments[0]?.contentId).toBe('<logo@example.test>');
});
it('editing the draft body replaces HTML rather than retaining stale original content', async () => {
  const { saveDraft } = await import('./send');
  mocks.read.mockResolvedValue({
    detail: { text: 'old' },
    originalHtml: '<p>old</p>',
    files: [],
  });
  await saveDraft(account, { ...payload, draftId: 'draft' });
  const body = JSON.parse(mocks.json.mock.calls[0]![2].body);
  const parsed = await PostalMime.parse(
    Buffer.from(body.message.raw, 'base64url')
  );
  expect(parsed.html).toBeUndefined();
  expect(parsed.text?.trim()).toBe('Test');
});

it.each(['reply', 'reply_all'] as const)(
  'Gmail %s includes the authorized source thread ID alongside MIME headers',
  async (mode) => {
    mocks.read.mockResolvedValue({
      detail: {
        subject: 'Hello',
        internetMessageId: '<source@example.test>',
        references: [],
      },
      providerThreadId: 'provider-thread',
      files: [],
    });
    await sendConnectedMessage(account, {
      ...payload,
      subject: 'Re: Hello',
      sourceId: 'source',
      mode,
    });
    const body = JSON.parse(mocks.json.mock.calls[0]![2].body);
    expect(body.threadId).toBe('provider-thread');
    expect(Buffer.from(body.raw, 'base64url').toString()).toContain(
      'In-Reply-To: <source@example.test>'
    );
  }
);
it.each(['forward', 'changed subject'] as const)(
  'Gmail %s starts a new conversation instead of forcing the old thread',
  async (kind) => {
    mocks.read.mockResolvedValue({
      detail: {
        subject: 'Hello',
        internetMessageId: '<source@example.test>',
        references: [],
      },
      providerThreadId: 'provider-thread',
      files: [],
    });
    await sendConnectedMessage(account, {
      ...payload,
      sourceId: 'source',
      mode: kind === 'forward' ? 'forward' : 'reply',
      subject: 'New subject',
    });
    expect(
      JSON.parse(mocks.json.mock.calls[0]![2].body).threadId
    ).toBeUndefined();
  }
);
it('saving a Gmail reply draft retains the source conversation', async () => {
  const { saveDraft } = await import('./send');
  mocks.read.mockResolvedValue({
    detail: {
      subject: 'Hello',
      internetMessageId: '<source@example.test>',
      references: [],
    },
    providerThreadId: 'provider-thread',
    files: [],
  });
  await saveDraft(account, {
    ...payload,
    sourceId: 'source',
    mode: 'reply',
    subject: 'Re: Hello',
  });
  expect(JSON.parse(mocks.json.mock.calls[0]![2].body).message.threadId).toBe(
    'provider-thread'
  );
});

it.each(['reply', 'draft'] as const)(
  'normalizes only provider-derived %s threading IDs and bounds references',
  async (kind) => {
    const references = Array.from(
      { length: 105 },
      (_, index) => `<r${index}@example.test>`
    );
    mocks.read.mockResolvedValue({
      detail: {
        internetMessageId: '<invalid id>',
        references: ['<invalid id>', ...references, `<${'x'.repeat(901)}>`],
      },
      originalInReplyTo: '<invalid id>',
      files: [],
    });
    const { saveDraft } = await import('./send');
    if (kind === 'draft')
      await saveDraft(account, { ...payload, draftId: 'draft' });
    else
      await sendConnectedMessage(account, {
        ...payload,
        sourceId: 'source',
        mode: 'reply',
      });
    const body = JSON.parse(mocks.json.mock.calls[0]![2].body);
    const parsed = await PostalMime.parse(
      Buffer.from(kind === 'draft' ? body.message.raw : body.raw, 'base64url')
    );
    expect(parsed.inReplyTo).toBeUndefined();
    expect(parsed.references?.split(' ')).toEqual(references.slice(-100));
  }
);
it('releases a claim after a proven pre-submission failure and permits an explicit user retry', async () => {
  mocks.json.mockRejectedValueOnce(
    new ConnectedMailError(409, 'Reconnect this mail account')
  );
  await expect(sendConnectedMessage(account, payload)).rejects.toMatchObject({
    status: 409,
  });
  expect(mocks.json).toHaveBeenCalledTimes(1);
  expect(mocks.delete).toHaveBeenCalledTimes(1);
  expect(mocks.eq).toHaveBeenCalledWith('status', 'sending');
  expect(mocks.eq).toHaveBeenCalledWith('payload_hash', expect.any(String));
  expect(mocks.update).not.toHaveBeenCalledWith({ status: 'uncertain' });
  expect(await sendConnectedMessage(account, payload)).toEqual({
    status: 'sent',
  });
  expect(mocks.json).toHaveBeenCalledTimes(2);
});
it.each([401, 429])(
  'releases only its exact sending claim after actual provider rejection %s',
  async (responseStatus) => {
    mocks.json.mockImplementationOnce(
      async (_account, _path, _init, started?: () => void) => {
        started?.();
        throw new MailProviderResponseError(responseStatus);
      }
    );
    await expect(sendConnectedMessage(account, payload)).rejects.toMatchObject({
      responseStatus,
    });
    expect(mocks.delete).toHaveBeenCalledTimes(1);
    expect(mocks.eq).toHaveBeenCalledWith('account_id', account.id);
    expect(mocks.eq).toHaveBeenCalledWith('request_id', payload.requestId);
    expect(mocks.eq).toHaveBeenCalledWith('status', 'sending');
    expect(mocks.json).toHaveBeenCalledTimes(1);
  }
);
it.each([408, 499, 500])(
  'retains an uncertain send fence for provider timeout/unknown response %s',
  async (responseStatus) => {
    mocks.json.mockImplementationOnce(
      async (_account, _path, _init, started?: () => void) => {
        started?.();
        throw new MailProviderResponseError(responseStatus);
      }
    );
    await expect(sendConnectedMessage(account, payload)).rejects.toMatchObject({
      responseStatus,
    });
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.update).toHaveBeenCalledWith({ status: 'uncertain' });
    expect(mocks.json).toHaveBeenCalledTimes(1);
  }
);
it('retains the fence when acceptance was confirmed but the receipt write failed', async () => {
  mocks.mutation.mockReturnValueOnce({ error: { message: 'Write failed' } });
  await expect(sendConnectedMessage(account, payload)).rejects.toThrow(
    'record provider send receipt'
  );
  expect(mocks.delete).not.toHaveBeenCalled();
  expect(mocks.update).toHaveBeenCalledWith({ status: 'uncertain' });
  expect(mocks.json).toHaveBeenCalledTimes(1);
});
it('does not claim a retry is available when conditional unsent-claim release matched no row', async () => {
  mocks.json.mockRejectedValueOnce(
    new ConnectedMailError(409, 'Reconnect this mail account')
  );
  mocks.maybeSingle.mockResolvedValueOnce({ data: null, error: null });
  await expect(sendConnectedMessage(account, payload)).rejects.toThrow(
    'release unsent mail claim'
  );
  expect(mocks.json).toHaveBeenCalledTimes(1);
});
it('never submits a concurrently in-flight identical request again', async () => {
  const { createHash } = await import('node:crypto');
  mocks.insert.mockResolvedValueOnce({ error: { code: '23505' } });
  mocks.receipt.mockResolvedValueOnce({
    data: {
      status: 'sending',
      payload_hash: createHash('sha256')
        .update(JSON.stringify(payload))
        .digest('hex'),
    },
    error: null,
  });
  await expect(sendConnectedMessage(account, payload)).rejects.toMatchObject({
    status: 409,
  });
  expect(mocks.json).not.toHaveBeenCalled();
  expect(mocks.delete).not.toHaveBeenCalled();
});
it('releases an Outlook draft claim when the readonly precheck proves it cannot send', async () => {
  const { sendProviderDraft } = await import('./send');
  mocks.json.mockResolvedValueOnce({ isDraft: false });
  await expect(
    sendProviderDraft(
      { ...account, provider: 'microsoft' },
      'draft',
      payload.requestId
    )
  ).rejects.toMatchObject({ status: 409 });
  expect(mocks.delete).toHaveBeenCalledTimes(1);
  expect(mocks.request).not.toHaveBeenCalled();
});
it('does not mistake a public 4xx error after submission for a proven provider rejection', async () => {
  mocks.json.mockImplementationOnce(
    async (_account, _path, _init, started?: () => void) => {
      started?.();
      throw new ConnectedMailError(409, 'Local validation after submit');
    }
  );
  await expect(sendConnectedMessage(account, payload)).rejects.toMatchObject({
    status: 409,
  });
  expect(mocks.delete).not.toHaveBeenCalled();
  expect(mocks.update).toHaveBeenCalledWith({ status: 'uncertain' });
});
it('keeps the acceptance fence even when a post-acceptance operation throws a provider-shaped 4xx', async () => {
  mocks.update.mockImplementationOnce(() => {
    throw new MailProviderResponseError(429);
  });
  await expect(sendConnectedMessage(account, payload)).rejects.toMatchObject({
    responseStatus: 429,
  });
  expect(mocks.delete).not.toHaveBeenCalled();
  expect(mocks.update).toHaveBeenCalledWith({ status: 'uncertain' });
  expect(mocks.json).toHaveBeenCalledTimes(1);
});
