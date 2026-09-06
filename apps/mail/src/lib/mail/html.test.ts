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

  it('preserves email tables, reply links, inline image references and typography', () => {
    const sanitized = sanitizeMailHtml(
      '<table><tr><td colspan="2"><p style="color:#123456;font-weight:bold">Hello</p><img src="cid:logo@example.test" alt="Logo"><a href="mailto:reply@example.test">Reply</a></td></tr></table>'
    );
    expect(sanitized).toContain('colspan="2"');
    expect(sanitized).toContain('color:#123456;font-weight:bold');
    expect(sanitized).toContain('src="cid:logo@example.test"');
    expect(sanitized).toContain('href="mailto:reply@example.test"');
  });

  it('rejects embedded documents, encoded script URLs and CSS resource loads', () => {
    const sanitized = sanitizeMailHtml(
      '<svg><a href="javascript:alert(1)">svg</a></svg><form><input value="secret"></form><img src="data:text/html,evil" onerror="alert(1)"><a href="jav&#x61;script:alert(1)">link</a><p style="background-image:url(https://tracker.example);color:red;width:expression(alert(1))">safe</p>'
    );
    expect(sanitized).not.toMatch(
      /<svg|<form|<input|javascript:|data:|onerror|url\(|expression\(/iu
    );
    expect(sanitized).toContain('color:red');
    expect(sanitized).toContain('safe');
  });
});
