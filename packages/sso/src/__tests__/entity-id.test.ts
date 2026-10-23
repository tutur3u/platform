import { describe, expect, it } from 'vitest';
import { entityIdSchema } from '../contracts';

describe('entityIdSchema', () => {
  it.each([
    'https://idp.example.test/metadata',
    'http://sp.example.test/saml',
    'urn:example:workos:sp',
  ])('accepts absolute HTTP(S) and URN entity IDs: %s', (value) => {
    expect(entityIdSchema.safeParse(value).success).toBe(true);
  });

  it.each([
    'javascript:alert(1)',
    'JavaScript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    'blob:https://idp.example.test/uuid',
    'relative/path',
    'https://idp.example.test/meta data',
  ])('rejects non-allowlisted or malformed entity IDs: %s', (value) => {
    expect(entityIdSchema.safeParse(value).success).toBe(false);
  });
});
