import { describe, expect, it } from 'vitest';
import {
  allowedUsers,
  readBounded,
  routeAllowed,
  signAssertion,
  verifyAssertion,
} from './protocol';
import { ingestSchema } from './schema';

const user = '11111111-1111-4111-8111-111111111111';
const secret = 'test-only-gateway-value-that-is-at-least-43-characters';
const now = 1_793_000_000_000;
describe('gateway assertions', () => {
  it('binds identity, method, path and query, and expires at 60 seconds', async () => {
    const signed = await signAssertion(
      secret,
      user,
      'GET',
      '/events?after=4',
      now
    );
    expect(
      await verifyAssertion(
        secret,
        signed,
        'GET',
        '/events?after=4',
        now + 59_999
      )
    ).toBe(user);
    for (const [method, target, time] of [
      ['GET', '/events?after=5', now],
      ['DELETE', '/events?after=4', now],
      ['GET', '/events?after=4', now + 60_000],
      ['GET', '/events?after=4', now - 1_000],
    ] as const)
      expect(
        await verifyAssertion(secret, signed, method, target, time)
      ).toBeNull();
    expect(
      await verifyAssertion(
        `${secret}wrong`,
        signed,
        'GET',
        '/events?after=4',
        now
      )
    ).toBeNull();
  });
  it('fails closed for malformed allowlists and targets', () => {
    expect([...allowedUsers(user)]).toEqual([user]);
    expect(allowedUsers(`${user},bad`).size).toBe(0);
    expect(routeAllowed('GET', '/events?after=4&after=5')).toBe(false);
    expect(routeAllowed('GET', '/snapshot?url=https://other.invalid')).toBe(
      false
    );
    expect(routeAllowed('POST', '/ingest')).toBe(false);
  });
  it('bounds streamed bytes without trusting content-length', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new Uint8Array(11));
        c.close();
      },
    });
    await expect(readBounded(stream, 10)).rejects.toThrow('Payload limit');
  });
});
describe('strict publisher boundary', () => {
  const snapshot = { needsYou: [], environments: [], lanes: [], backlog: [] };
  const body = { v: 2, seq: 1, sentAt: now, snapshot, events: [] };
  it('rejects unknown fields at every nesting level and excessive batches', () => {
    expect(
      ingestSchema.safeParse({ ...body, token: 'forbidden' }).success
    ).toBe(false);
    expect(
      ingestSchema.safeParse({
        ...body,
        snapshot: { ...snapshot, raw: 'forbidden' },
      }).success
    ).toBe(false);
    expect(
      ingestSchema.safeParse({ ...body, events: Array(101).fill({}) }).success
    ).toBe(false);
  });
  it.each([
    'ghp_canary',
    'person@example.invalid',
    'https://host.invalid/hooks/canary',
    '192.168.0.1',
    '~/private',
    'Bearer canary',
    '123456789012',
    user,
  ])('withholds unsafe text %s', (value) => {
    const parsed = ingestSchema.parse({
      ...body,
      snapshot: {
        ...snapshot,
        backlog: [
          { id: 'item', title: value, owner: 'Mastermind', state: 'held' },
        ],
      },
    });
    expect(parsed.snapshot?.backlog[0]?.title).toBe('Withheld, open on Mac');
  });
  it('reduces security details and sanitizes production and staging subjects', () => {
    const parsed = ingestSchema.parse({
      ...body,
      snapshot: {
        ...snapshot,
        needsYou: [
          {
            id: 'security-item',
            version: 1,
            contentHash: 'a'.repeat(64),
            class: 'security',
            risk: 'high',
            title: 'Specific flaw',
            body: 'Private detail',
            questions: [],
            status: 'open',
            severity: 'high',
          },
        ],
        environments: ['production', 'staging'].map((environment) => ({
          product: 'tuturuuu',
          environment,
          lastRelease: now,
          version: 'v1',
          shortSha: 'abc1234',
          commitSubject: 'fix: IDOR details',
          deployState: 'held',
          ciState: 'success',
        })),
      },
    });
    expect(parsed.snapshot?.needsYou[0]?.title).toBe('Security issue');
    expect(parsed.snapshot?.needsYou[0]?.body).toBeUndefined();
    expect(parsed.snapshot?.needsYou[0]?.questions).toBeUndefined();
    expect(parsed.snapshot?.environments.map((e) => e.commitSubject)).toEqual([
      'Security fix',
      'Security fix',
    ]);
  });
});
