import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  table: vi.fn(),
  json: vi.fn(),
  request: vi.fn(),
  read: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  receipt: vi.fn(),
}));
vi.mock('./repository', () => ({ table: mocks.table }));
vi.mock('./transport', () => ({
  providerJson: mocks.json,
  providerRequest: mocks.request,
  jsonBody: (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) }),
}));
vi.mock('./messages', () => ({ readMessage: mocks.read }));

import { composeSchema } from './mime';
import type { ConnectedAccount } from './repository';
import { respondToConnectedInvitation, sendConnectedMessage } from './send';

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
    eq: vi.fn(),
    single: mocks.receipt,
    // biome-ignore lint/suspicious/noThenProperty: emulate the awaited PostgREST mutation builder
    then: (resolve: (value: unknown) => void) => resolve({ error: null }),
  };
  chain.eq.mockReturnValue(chain);
  chain.select.mockReturnValue(chain);
  mocks.update.mockReturnValue(chain);
  mocks.table.mockResolvedValue({
    insert: mocks.insert,
    update: mocks.update,
    select: chain.select,
  });
  mocks.json.mockResolvedValue({ id: 'provider-message' });
  mocks.request.mockResolvedValue(new Response(null, { status: 202 }));
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
    mocks.json.mockRejectedValue(new Error('Connection lost'));
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
