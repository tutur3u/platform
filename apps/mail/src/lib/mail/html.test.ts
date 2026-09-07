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

describe('isolated email document rendering', () => {
  it('retains newsletter styles only in the isolated document path', () => {
    const html =
      '<style>@media(max-width:600px){.body{width:100%}}</style><table bgcolor="#ffffff" style="padding:12px 20px;border-collapse:collapse"><tr><td>Hello</td></tr></table>';
    expect(sanitizeMailHtml(html)).not.toContain('<style');
    const isolated = sanitizeMailHtml(html, { isolatedDocument: true });
    expect(isolated).toContain('@media');
    expect(isolated).toContain('padding:12px 20px');
    expect(isolated).toContain('bgcolor="#ffffff"');
  });
  it('maps only supplied protected inline images and isolates links', () => {
    const output = sanitizeMailHtml(
      '<img src="cid:logo"><a href="https://example.com" target="_top">Open</a>',
      {
        isolatedDocument: true,
        inlineImages: { logo: '/api/v1/workspaces/ws/mail/image' },
      }
    );
    expect(output).toContain('src="/api/v1/workspaces/ws/mail/image"');
    expect(output).toContain('target="_blank"');
    expect(output).toContain('rel="noopener noreferrer"');
    expect(output).not.toContain('_top');
  });
  it('still removes executable tags and event handlers with stylesheet retention', () => {
    const output = sanitizeMailHtml(
      '<style>.a{color:red}</style><script>steal()</script><img src="x" onerror="steal()"><meta http-equiv="refresh" content="0;url=https://evil.test"><form action="https://evil.test">x</form>',
      { isolatedDocument: true }
    );
    expect(output).not.toMatch(/<script|<meta|<form|onerror|steal\(/);
  });
});

it('preserves newsletter preheader hiding and layout only in isolated documents', () => {
  const html =
    '<div style="display:none;max-height:0;overflow:hidden;mso-hide:all">Preview</div><table style="margin:0 auto;padding:24px 32px"><tr><td>Body</td></tr></table>';
  const result = sanitizeMailHtml(html, { isolatedDocument: true });
  expect(result).toContain('max-height:0');
  expect(result).toContain('overflow:hidden');
  expect(result).toContain('padding:24px 32px');
  expect(sanitizeMailHtml(html)).not.toContain('mso-hide');
});
