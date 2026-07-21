import { describe, expect, it } from 'vitest';
import { sanitizeMailHtml } from './html';

describe('sanitizeMailHtml', () => {
  it('removes executable markup across repeated and mixed-case payloads', () => {
    const sanitized = sanitizeMailHtml(`
      <p onclick="alert(1)">Safe text</p>
      <script><script>alert(1)</script></script>
      <a href="javascript:alert(1)" onmouseover="alert(2)">link</a>
      <iframe src="https://attacker.example"></iframe>
    `);

    expect(sanitized).toContain('Safe text');
    expect(sanitized).not.toMatch(/<script|<iframe|javascript:|\son[a-z]+=/iu);
  });
});
