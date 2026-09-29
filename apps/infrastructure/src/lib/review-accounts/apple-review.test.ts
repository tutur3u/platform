import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  account: vi.fn(),
  credentials: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('./service', () => ({
  assertActiveReviewerAccount: mocks.account,
  ReviewAccountError: class extends Error {
    constructor(
      message: string,
      readonly status: number
    ) {
      super(message);
    }
  },
}));
vi.mock('./apple-vault', () => ({
  readActiveAppleReviewCredentials: mocks.credentials,
}));
vi.mock('@/lib/mobile-deployment/store', () => ({ recordAudit: mocks.audit }));
vi.mock('jose', () => ({
  importPKCS8: vi.fn(async () => 'key'),
  SignJWT: class {
    setProtectedHeader() {
      return this;
    }
    setIssuer() {
      return this;
    }
    setAudience() {
      return this;
    }
    setIssuedAt() {
      return this;
    }
    setExpirationTime() {
      return this;
    }
    async sign() {
      return 'signed-token';
    }
  },
}));

import { publishReviewerToApple } from './apple-review';

describe('Apple reviewer metadata handoff', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.credentials.mockResolvedValue({
      privateKey: 'private-key',
      keyId: 'key-id',
      issuerId: 'issuer-id',
      environmentId: 'environment',
      versionId: 'version',
    });
  });

  it('writes password only in dedicated Apple field and confirms notes', async () => {
    const password = 'private-review-password';
    let publishedNotes = '';
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.includes('/v1/apps?'))
          return Response.json({ data: [{ id: 'app' }] });
        if (url.endsWith('/betaAppReviewDetail'))
          return Response.json({
            data: {
              id: 'detail',
              attributes: {
                demoAccountRequired: true,
                demoAccountName: 'review@tuturuuu.com',
                notes: publishedNotes,
              },
            },
          });
        if (url.endsWith('/v1/betaAppReviewDetails/detail')) {
          const body = JSON.parse(String(init?.body));
          expect(body.data.attributes.demoAccountPassword).toBe(password);
          publishedNotes = body.data.attributes.notes;
          expect(publishedNotes).not.toContain(password);
          return Response.json({ data: { id: 'detail' } });
        }
        throw new Error('Unexpected Apple request');
      });
    try {
      await expect(
        publishReviewerToApple({
          db: {} as never,
          actorUserId: 'actor',
          reviewerUserId: 'reviewer',
          email: 'review@tuturuuu.com',
          password,
        })
      ).resolves.toEqual({ configured: true });
      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect(mocks.audit).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          eventType: 'review_account.apple_metadata_published',
          metadata: { reviewerUserId: 'reviewer' },
        })
      );
    } finally {
      fetchMock.mockRestore();
    }
  });

  it('does not expose Apple error payloads that may contain credentials', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response('credential in upstream error', { status: 403 })
      );
    try {
      await expect(
        publishReviewerToApple({
          db: {} as never,
          actorUserId: 'actor',
          reviewerUserId: 'reviewer',
          email: 'review@tuturuuu.com',
          password: 'private-review-password',
        })
      ).rejects.toThrow('Apple review metadata update failed (403)');
      expect(mocks.audit).not.toHaveBeenCalled();
    } finally {
      fetchMock.mockRestore();
    }
  });
});
