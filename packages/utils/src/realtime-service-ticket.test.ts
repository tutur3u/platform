import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  isTrustedRealtimeServiceRequest,
  verifyRealtimeServiceTicket,
} from './realtime-service-ticket';

const secret = 'disposable-test-secret';
function sign(payload: Record<string, unknown>, key = secret) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${createHmac('sha256', key).update(encoded).digest('base64url')}`;
}
const future = Math.floor(Date.now() / 1000) + 30;
const ticket = sign({
  aud: 'tuturuuu.channels',
  kind: 'document-checkpoint',
  exp: future,
});
const headers = (token: string) =>
  new Headers({ authorization: `Bearer ${token}` });

describe('verifyRealtimeServiceTicket', () => {
  it('accepts a signed, unexpired service ticket', () => {
    expect(verifyRealtimeServiceTicket(ticket, secret)).toEqual({
      kind: 'document-checkpoint',
      exp: future,
    });
  });
  it('rejects wrong secrets, foreign kinds, expiry, and malformed tokens', () => {
    expect(verifyRealtimeServiceTicket(ticket, 'other')).toBeNull();
    expect(verifyRealtimeServiceTicket(ticket, undefined)).toBeNull();
    expect(
      verifyRealtimeServiceTicket(
        sign({ aud: 'tuturuuu.channels', kind: 'join', exp: future }),
        secret
      )
    ).toBeNull();
    expect(
      verifyRealtimeServiceTicket(
        sign({
          aud: 'tuturuuu.channels',
          kind: 'document-checkpoint',
          exp: future - 60,
        }),
        secret
      )
    ).toBeNull();
    expect(verifyRealtimeServiceTicket('eyJhIjoxfQ.c2ln', secret)).toBeNull();
    expect(verifyRealtimeServiceTicket('not-a-token', secret)).toBeNull();
  });
});

describe('isTrustedRealtimeServiceRequest', () => {
  it('trusts only the checkpoint routes with a verified ticket', () => {
    expect(
      isTrustedRealtimeServiceRequest(
        '/api/v1/realtime/documents/checkpoint',
        headers(ticket),
        secret
      )
    ).toBe(true);
    expect(
      isTrustedRealtimeServiceRequest(
        '/api/v1/realtime/programming/checkpoint',
        headers(
          sign({
            aud: 'tuturuuu.collaboration',
            kind: 'checkpoint',
            exp: future,
          })
        ),
        secret
      )
    ).toBe(true);
    expect(
      isTrustedRealtimeServiceRequest(
        '/api/v1/workspaces',
        headers(ticket),
        secret
      )
    ).toBe(false);
    expect(
      isTrustedRealtimeServiceRequest(
        '/api/v1/realtime/documents/checkpoint',
        headers(ticket),
        'other'
      )
    ).toBe(false);
    expect(
      isTrustedRealtimeServiceRequest(
        '/api/v1/realtime/documents/checkpoint',
        new Headers(),
        secret
      )
    ).toBe(false);
  });
});
