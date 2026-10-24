import { describe, expect, it } from 'vitest';
import { entityIdSchema } from '../contracts';

describe('SAML entity IDs', () => {
  it.each([
    'https://idp.example.test/metadata',
    'http://www.okta.example/exk1',
    'urn:example:workos:sp',
    'URN:oasis:names:tc:SAML:2.0:entity',
    'tag:example.test,2026:sp',
    'ldap://directory.example.test/o=Example',
    'custom+scheme.v1:opaque-identifier',
  ])('accepts absolute URI %s', (entityId) => {
    expect(entityIdSchema.safeParse(entityId).success).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,hello',
    'DaTa:text/plain,hello',
    'vbscript:msgbox(1)',
    'VBScript:msgbox(1)',
    'file:///etc/hosts',
    'FiLe:///etc/hosts',
  ])('rejects blocked scheme %s', (entityId) => {
    expect(entityIdSchema.safeParse(entityId).success).toBe(false);
  });

  it.each([
    'https://idp.example.test/meta data',
    'urn:example:\tsp',
    'urn:example:sp\n',
    'urn:example:\u0085sp',
    ' urn:example:sp',
    'relative/path',
    '1urn:example',
    ':no-scheme',
  ])('rejects malformed or non-absolute value %j', (entityId) => {
    expect(entityIdSchema.safeParse(entityId).success).toBe(false);
  });
});
