import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  isTrustedRealtimeServiceRequest,
  REALTIME_SERVICE_TICKET_ROUTES,
  verifyRealtimeServiceTicket,
} from './realtime-service-ticket';

const secret = 'disposable-test-secret';
const DOCUMENT = '/api/v1/realtime/documents/checkpoint';
const PROGRAMMING = '/api/v1/realtime/programming/checkpoint';
const future = Math.floor(Date.now() / 1000) + 30;
function sign(payload: Record<string, unknown>, key = secret) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${encoded}.${createHmac('sha256', key).update(encoded).digest('base64url')}`;
}
const documentTicket = sign({
  aud: 'tuturuuu.channels',
  kind: 'document-checkpoint',
  exp: future,
});
const programmingTicket = sign({
  aud: 'tuturuuu.collaboration',
  kind: 'checkpoint',
  exp: future,
});
const headers = (token: string, extra: Record<string, string> = {}) =>
  new Headers({ authorization: `Bearer ${token}`, ...extra });
const trusted = (
  pathname: string,
  token: string,
  method: string | undefined,
  extra: Record<string, string> = {}
) =>
  isTrustedRealtimeServiceRequest(
    pathname,
    headers(token, extra),
    method,
    secret
  );

describe('verifyRealtimeServiceTicket', () => {
  it('accepts a signed, unexpired ticket on its own route', () => {
    expect(
      verifyRealtimeServiceTicket(DOCUMENT, documentTicket, secret)
    ).toEqual({
      kind: 'document-checkpoint',
      exp: future,
    });
    expect(
      verifyRealtimeServiceTicket(PROGRAMMING, programmingTicket, secret)?.kind
    ).toBe('checkpoint');
    expect(
      verifyRealtimeServiceTicket(
        PROGRAMMING,
        sign({
          aud: 'tuturuuu.collaboration',
          kind: 'runner-files',
          exp: future,
        }),
        secret
      )?.kind
    ).toBe('runner-files');
  });
  it('binds audience and kind to the route (full cross-product)', () => {
    const audiences = [
      'tuturuuu.channels',
      'tuturuuu.collaboration',
      'tuturuuu.meet',
    ];
    const kinds = [
      'document-checkpoint',
      'checkpoint',
      'runner-files',
      'join',
      'publish',
    ];
    const accepted: string[] = [];
    for (const pathname of [DOCUMENT, PROGRAMMING])
      for (const aud of audiences)
        for (const kind of kinds)
          if (
            verifyRealtimeServiceTicket(
              pathname,
              sign({ aud, kind, exp: future }),
              secret
            )
          )
            accepted.push(`${pathname} ${aud} ${kind}`);
    expect(accepted.sort()).toEqual([
      `${DOCUMENT} tuturuuu.channels document-checkpoint`,
      `${PROGRAMMING} tuturuuu.collaboration checkpoint`,
      `${PROGRAMMING} tuturuuu.collaboration runner-files`,
    ]);
  });
  it('rejects wrong secrets, expiry, missing exp and malformed tokens', () => {
    expect(
      verifyRealtimeServiceTicket(DOCUMENT, documentTicket, 'other')
    ).toBeNull();
    expect(
      verifyRealtimeServiceTicket(DOCUMENT, documentTicket, undefined)
    ).toBeNull();
    expect(
      verifyRealtimeServiceTicket(DOCUMENT, documentTicket, ' ')
    ).toBeNull();
    expect(
      verifyRealtimeServiceTicket(
        DOCUMENT,
        sign({
          aud: 'tuturuuu.channels',
          kind: 'document-checkpoint',
          exp: future - 60,
        }),
        secret
      )
    ).toBeNull();
    expect(
      verifyRealtimeServiceTicket(
        DOCUMENT,
        sign({ aud: 'tuturuuu.channels', kind: 'document-checkpoint' }),
        secret
      )
    ).toBeNull();
    expect(
      verifyRealtimeServiceTicket(DOCUMENT, 'eyJhIjoxfQ.c2ln', secret)
    ).toBeNull();
    expect(
      verifyRealtimeServiceTicket(DOCUMENT, 'not-a-token', secret)
    ).toBeNull();
    expect(
      verifyRealtimeServiceTicket(DOCUMENT, `${documentTicket}.extra`, secret)
    ).toBeNull();
    expect(verifyRealtimeServiceTicket(DOCUMENT, '', secret)).toBeNull();
    expect(verifyRealtimeServiceTicket(DOCUMENT, null, secret)).toBeNull();
  });
  it('rejects an ordinary Supabase-style JWT even when signed with the secret', () => {
    const jwt = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiJ1c2VyIn0', 'c2ln'].join(
      '.'
    );
    expect(verifyRealtimeServiceTicket(DOCUMENT, jwt, secret)).toBeNull();
    const signedJwtShape = sign({
      sub: 'user',
      role: 'authenticated',
      exp: future,
    });
    expect(
      verifyRealtimeServiceTicket(DOCUMENT, signedJwtShape, secret)
    ).toBeNull();
  });
});

describe('isTrustedRealtimeServiceRequest', () => {
  it('trusts only a POST to the exact route with a matching ticket', () => {
    expect(trusted(DOCUMENT, documentTicket, 'POST')).toBe(true);
    expect(trusted(PROGRAMMING, programmingTicket, 'POST')).toBe(true);
    expect(trusted(DOCUMENT, programmingTicket, 'POST')).toBe(false);
    expect(trusted(PROGRAMMING, documentTicket, 'POST')).toBe(false);
  });
  it('fails closed for every other method, including an unknown one', () => {
    for (const method of [
      'GET',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS',
      'HEAD',
      'post',
      undefined,
    ])
      expect(trusted(DOCUMENT, documentTicket, method)).toBe(false);
  });
  it('matches the pathname exactly: no encoding, case, slash, prefix or suffix variants', () => {
    for (const pathname of [
      '/api/v1/realtime/documents/checkpoint/',
      '/api/v1/realtime/documents/checkpoint/extra',
      '/api/v1/realtime/documents/checkpoint%2F',
      '/api/v1/realtime/documents/%63heckpoint',
      '/API/v1/realtime/documents/checkpoint',
      '/api/v1/realtime/Documents/checkpoint',
      '/prefix/api/v1/realtime/documents/checkpoint',
      '//api/v1/realtime/documents/checkpoint',
      '/api/v1/realtime/documents/checkpoint.json',
      '/api/v1/realtime/documents/checkpoints',
      '/api/v1/realtime/documents',
      '/api/v1/workspaces',
      '',
    ])
      expect(trusted(pathname, documentTicket, 'POST'), pathname).toBe(false);
    expect([...REALTIME_SERVICE_TICKET_ROUTES].sort()).toEqual([
      DOCUMENT,
      PROGRAMMING,
    ]);
  });
  it('ignores the User-Agent: the ticket, not a spoofable header, is the credential', () => {
    expect(
      trusted(DOCUMENT, documentTicket, 'POST', { 'user-agent': '' })
    ).toBe(true);
    expect(
      trusted(DOCUMENT, documentTicket, 'POST', { 'user-agent': 'Mozilla/5.0' })
    ).toBe(true);
    expect(
      isTrustedRealtimeServiceRequest(DOCUMENT, new Headers(), 'POST', secret)
    ).toBe(false);
    expect(
      isTrustedRealtimeServiceRequest(
        DOCUMENT,
        new Headers({ authorization: `Basic ${documentTicket}` }),
        'POST',
        secret
      )
    ).toBe(false);
    expect(
      isTrustedRealtimeServiceRequest(
        DOCUMENT,
        new Headers({ authorization: `Bearer ${documentTicket} trailing` }),
        'POST',
        secret
      )
    ).toBe(false);
  });
  it('rejects a valid ticket under a different secret', () => {
    expect(
      isTrustedRealtimeServiceRequest(
        DOCUMENT,
        headers(documentTicket),
        'POST',
        'other'
      )
    ).toBe(false);
    expect(
      isTrustedRealtimeServiceRequest(
        DOCUMENT,
        headers(documentTicket),
        'POST',
        undefined
      )
    ).toBe(false);
  });
});
