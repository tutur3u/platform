import { describe, expect, it } from 'vitest';
import { entityIdSchema } from '../contracts';

describe('SAML entity IDs', () => {
  it.each([
    'https://idp.example.test/metadata',
    'http://www.okta.example/exk1',
    'urn:example:workos:sp',
    'URN:oasis:names:tc:SAML:2.0:entity',
  ])('accepts %s', (entityId) => {
    expect(entityIdSchema.safeParse(entityId).success).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    'data:text/html,hello',
    'vbscript:msgbox(1)',
    'file:///etc/hosts',
    'blob:https://example.test/id',
    'https://idp.example.test/meta data',
    'relative/path',
  ])('rejects %s', (entityId) => {
    expect(entityIdSchema.safeParse(entityId).success).toBe(false);
  });
});
