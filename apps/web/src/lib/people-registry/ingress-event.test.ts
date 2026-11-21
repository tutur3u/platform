import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  PEOPLE_EVENT_DOMAIN,
  type PeopleRegistryOperation,
  verifyPeopleIngressEvent,
} from './ingress-event';

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const other = generateKeyPairSync('ed25519');
const raw = (key: typeof publicKey) =>
  key.export({ format: 'der', type: 'spki' }).subarray(-32).toString('base64');
const keys = JSON.stringify({ 'mira-1': raw(publicKey) });
const body = new TextEncoder().encode('{"query":"hi"}');
const now = 1_800_000_000_000;

function proofHeaders(
  overrides: Record<string, unknown> = {},
  options: { kid?: string; signer?: typeof privateKey; domain?: string } = {}
) {
  const event = {
    version: 1,
    kid: 'mira-1',
    channel: 'zalo',
    account: 'acct-1',
    sender: 'sender-1',
    conversation: 'conv-1',
    conversationType: 'private_1_to_1',
    eventId: 'evt-1',
    operation: 'registry.recall',
    inputSha256: createHash('sha256').update(body).digest('hex'),
    issuedAt: now,
    ...overrides,
  };
  const proof = Buffer.from(JSON.stringify(event)).toString('base64url');
  return new Headers({
    'x-people-event-key-id': options.kid ?? 'mira-1',
    'x-people-event': proof,
    'x-people-event-signature': sign(
      null,
      Buffer.from(`${options.domain ?? PEOPLE_EVENT_DOMAIN}.${proof}`),
      options.signer ?? privateKey
    ).toString('base64url'),
  });
}

const check = (
  headers: Headers,
  operation: PeopleRegistryOperation = 'registry.recall',
  extra: { body?: Uint8Array; now?: number } = {}
) =>
  verifyPeopleIngressEvent({
    headers,
    body: extra.body ?? body,
    operation,
    keys,
    now: extra.now ?? now,
  });

describe('verifyPeopleIngressEvent', () => {
  it('returns the evidence with the Fleet-compatible event hash', () => {
    expect(check(proofHeaders())).toEqual({
      kid: 'mira-1',
      channel: 'zalo',
      account: 'acct-1',
      sender: 'sender-1',
      conversation: 'conv-1',
      conversationType: 'private_1_to_1',
      operation: 'registry.recall',
      eventHash: createHash('sha256').update('evt-1').digest('hex'),
    });
  });

  it('accepts group conversations for registry operations', () => {
    expect(
      check(
        proofHeaders({
          operation: 'registry.write',
          conversationType: 'group',
        }),
        'registry.write'
      )?.conversationType
    ).toBe('group');
  });

  it.each([
    ['another operation', proofHeaders({ operation: 'registry.write' })],
    ['a Fleet operation', proofHeaders({ operation: 'intent.submit' })],
    [
      'an unknown conversation type',
      proofHeaders({ conversationType: 'channel' }),
    ],
    ['a mismatched payload kid', proofHeaders({ kid: 'mira-2' })],
    ['an unknown key id', proofHeaders({}, { kid: 'mira-9' })],
    ['another signer', proofHeaders({}, { signer: other.privateKey })],
    [
      'the Fleet signing domain',
      proofHeaders({}, { domain: 'fleet-event-v2' }),
    ],
    ['an extra field', proofHeaders({ deskId: 'desk-1' })],
    ['an old version', proofHeaders({ version: 2 })],
  ])('refuses %s', (_name, headers) => {
    expect(check(headers)).toBeNull();
  });

  it('refuses a different body, a stale proof and a future proof', () => {
    expect(
      check(proofHeaders(), 'registry.recall', {
        body: new TextEncoder().encode('{}'),
      })
    ).toBeNull();
    expect(
      check(proofHeaders(), 'registry.recall', { now: now + 300_001 })
    ).toBeNull();
    expect(
      check(proofHeaders(), 'registry.recall', { now: now - 30_001 })
    ).toBeNull();
  });

  it('refuses when no ingress keys are configured', () => {
    expect(
      verifyPeopleIngressEvent({
        headers: proofHeaders(),
        body,
        operation: 'registry.recall',
        keys: '',
        now,
      })
    ).toBeNull();
  });
});
