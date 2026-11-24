import { fixture } from '@tuturuuu/sso/testing';
import { describe, expect, it } from 'vite-plus/test';
import { CLIENT, KID, keyMapText } from './__tests__/harness';
import { signingKeySecretName } from './input';
import { MAX_BOUND_KIDS, parseKeyMap, resolveSigningKey } from './key-binding';

const f = fixture();
const secrets: Record<string, string> = { SSO_SIGNING_KEY_SAML_TEST_1: 'pem' };
const resolve = (over: Partial<Parameters<typeof resolveSigningKey>[0]> = {}) =>
  resolveSigningKey({
    keyMap: parseKeyMap(keyMapText(f)),
    kid: KID,
    client: CLIENT,
    protocol: 'saml',
    secret: (name) => secrets[name],
    ...over,
  });

describe('kid binding', () => {
  it('maps a kid to its secret name injectively', () => {
    expect(signingKeySecretName('saml-test-1')).toBe(
      'SSO_SIGNING_KEY_SAML_TEST_1'
    );
  });

  it('resolves the bound certificate and the kid secret', () => {
    expect(resolve()).toEqual({
      ok: true,
      certificate: f.certificate,
      privateKey: 'pem',
    });
  });

  it.each([
    ['an unknown kid', { kid: 'saml-test-2' }],
    ['another client', { client: '00000000-0000-4000-8000-000000000bad' }],
    ['another protocol', { protocol: 'oidc' }],
    ['an inherited property name', { kid: 'constructor' }],
  ])('refuses %s', (_label, over) => {
    expect(resolve(over)).toEqual({ ok: false, error: 'key_binding' });
  });

  it('refuses a kid bound to OIDC when asked for SAML', () => {
    expect(
      resolve({ keyMap: parseKeyMap(keyMapText(f, { protocol: 'oidc' })) })
    ).toEqual({ ok: false, error: 'key_binding' });
  });

  it('is misconfigured without a map or without the kid secret', () => {
    expect(resolve({ keyMap: null })).toEqual({
      ok: false,
      error: 'misconfigured',
    });
    expect(resolve({ secret: () => undefined })).toEqual({
      ok: false,
      error: 'misconfigured',
    });
  });

  it('parses only well-formed maps', () => {
    const entry = JSON.parse(keyMapText(f))[KID];
    const many = Object.fromEntries(
      Array.from({ length: MAX_BOUND_KIDS + 1 }, (_, i) => [`k${i}`, entry])
    );
    for (const raw of [
      '',
      '{',
      '[]',
      JSON.stringify({ Bad_Kid: entry }),
      JSON.stringify({ [KID]: { ...entry, extra: true } }),
      JSON.stringify({ [KID]: { ...entry, certificate: 'not a cert' } }),
      JSON.stringify({ [KID]: { ...entry, protocol: 'ws-fed' } }),
      JSON.stringify(many),
    ]) {
      expect(parseKeyMap(raw), raw.slice(0, 40)).toBeNull();
    }
  });
});
