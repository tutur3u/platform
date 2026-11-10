/** D79 tests for the roadmap CSP (run via src/roadmap-data.test.ts). */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  contentSecurityPolicy,
  inlineScripts,
  withContentSecurityPolicy,
} from './csp.ts';

describe('content security policy', () => {
  const HTML =
    '<!doctype html><html><head><script>self.theme=1</script>' +
    '<script type="module" src="/roadmap/assets/index-Abcd1234.js"></script></head>' +
    '<body><div style="width:40%"></div><script>(self.$R=self.$R||{})</script >' +
    '<script></script></body></html>';

  it('hashes exactly the inline scripts and nothing broader', async () => {
    assert.deepEqual(inlineScripts(HTML), [
      'self.theme=1',
      '(self.$R=self.$R||{})',
    ]);
    const policy = await contentSecurityPolicy(HTML);
    const scriptSrc = policy.split('; ')[0];
    for (const body of inlineScripts(HTML)) {
      const hash = createHash('sha256').update(body).digest('base64');
      assert.ok(scriptSrc.includes(`'sha256-${hash}'`), body);
    }
    assert.doesNotMatch(scriptSrc, /unsafe-inline|unsafe-eval|\*|https?:/);
    assert.match(policy, /connect-src 'self' https:\/\/api\.github\.com/);
    assert.match(policy, /object-src 'none'/);
    assert.match(policy, /frame-ancestors 'self'/);
  });

  it('broken variant: a script injected after SSR is not allowed', async () => {
    const policy = await contentSecurityPolicy(HTML);
    const injected = createHash('sha256').update('alert(1)').digest('base64');
    assert.ok(!policy.includes(injected));
  });

  it('attaches the header to HTML only and keeps the body byte-for-byte', async () => {
    const html = await withContentSecurityPolicy(
      new Response(HTML, {
        status: 404,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'content-length': '1',
        },
      })
    );
    assert.equal(html.status, 404);
    assert.equal(await html.text(), HTML);
    assert.match(
      html.headers.get('content-security-policy') ?? '',
      /^script-src 'self' 'sha256-/
    );
    assert.equal(html.headers.get('content-length'), null);
    const json = new Response('{}', {
      headers: { 'content-type': 'application/json' },
    });
    assert.equal(await withContentSecurityPolicy(json), json);
    const head = await withContentSecurityPolicy(
      new Response(null, { headers: { 'content-type': 'text/html' } })
    );
    assert.ok(head.headers.get('content-security-policy'));
    assert.equal(head.body, null);
  });

  it('roadmap source has no HTML or eval sinks that would bypass escaping', () => {
    const root = new URL('.', import.meta.url);
    const files = readdirSync(root, { recursive: true })
      .map(String)
      .filter(
        (f) =>
          /\.(ts|tsx)$/.test(f) &&
          !f.endsWith('.test.ts') &&
          !f.includes('routeTree.gen')
      );
    assert.ok(files.length > 10);
    for (const file of files) {
      const source = readFileSync(new URL(file, root), 'utf8');
      assert.doesNotMatch(
        source,
        /dangerouslySetInnerHTML|\.innerHTML\s*=|\beval\(|new Function\(/,
        file
      );
    }
  });
});

describe('content security policy: end-tag variants', () => {
  it('finds inline scripts whose end tags carry whitespace or attributes', () => {
    assert.deepEqual(
      inlineScripts(
        '<script>a()</script >x<script>b()</SCRIPT\t\nfoo>y<script>c()</script>'
      ),
      ['a()', 'b()', 'c()']
    );
  });
});

describe('content security policy: styles', () => {
  it('allows inline styles (no script) while scripts stay hash-only', async () => {
    const policy = await contentSecurityPolicy('<script>a()</script>');
    assert.match(policy, /style-src 'self' 'unsafe-inline'/);
    assert.doesNotMatch(policy.split('; ')[0], /unsafe-inline/);
  });
});

describe('content security policy: only real script elements are hashed (D87 A5)', () => {
  const sha = (text: string) =>
    createHash('sha256').update(text).digest('base64');
  const injected = 'alert(1)';

  const variants: [string, string][] = [
    [
      'double-quoted attribute',
      `<div title="<script>${injected}</script>">x</div>`,
    ],
    [
      'single-quoted attribute',
      `<a data-x='<script>${injected}</script>' href="/">x</a>`,
    ],
    ['unquoted attribute', `<p data-x=<script>${injected}</script>>x</p>`],
    ['comment', `<!-- <script>${injected}</script> -->`],
    ['title text', `<title><script>${injected}</script></title>`],
    ['textarea text', `<textarea><script>${injected}</script></textarea>`],
    ['style text', `<style>/* <script>${injected}</script> */</style>`],
  ];
  for (const [name, snippet] of variants)
    it(`an attribute or text containing <script> is never hashed: ${name}`, async () => {
      const html = `<!doctype html><html><head><script>boot()</script></head><body>${snippet}<script>later()</script></body></html>`;
      assert.deepEqual(inlineScripts(html), ['boot()', 'later()']);
      const policy = await contentSecurityPolicy(html);
      assert.ok(
        !policy.includes(sha(injected)),
        'injected text must not be allowed'
      );
      assert.ok(
        policy.includes(sha('boot()')) && policy.includes(sha('later()'))
      );
    });

  it('src is an exact attribute name; data-src stays inline', () => {
    assert.deepEqual(
      inlineScripts(
        '<script src="/a.js"></script><script SRC=/b.js></script><script data-src="x">c()</script>'
      ),
      ['c()']
    );
  });

  it('keeps Unicode text aligned (length-preserving lowercase)', () => {
    assert.deepEqual(
      inlineScripts(
        '<p>İstanbul Tiếng Việt</p><SCRIPT>d()</SCRIPT ><script>e()</script\nx>'
      ),
      ['d()', 'e()']
    );
  });

  it('broken variant: the attribute holds a complete script element as text', () => {
    // A whole-document scan sees this as a script; the tokenizer must not.
    const html = `<div title="<script>${injected}</script>"></div>`;
    assert.ok(html.includes(`<script>${injected}</script>`));
    assert.deepEqual(inlineScripts(html), []);
  });
});
