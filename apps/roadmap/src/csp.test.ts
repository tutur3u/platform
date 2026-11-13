/**
 * D79 tests for the roadmap CSP (run via src/roadmap-data.test.ts).
 *
 * src/csp.ts collects inline scripts with the Workers runtime's HTMLRewriter,
 * which Node does not have, so these tests run csp.ts inside workerd
 * (miniflare) and talk to it over dispatchFetch.
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { after, describe, it } from 'node:test';
import { Miniflare } from 'miniflare';
import { MAX_DOCUMENT_BYTES } from './csp.ts';
import { inlineScriptTexts } from './html-scripts.ts';

const CSP_SOURCE = readFileSync(new URL('./csp.ts', import.meta.url), 'utf8');
assert.doesNotMatch(CSP_SOURCE, /^import /m, 'csp.ts must stay import-free');

const ENTRY = `
import { contentSecurityPolicy, inlineScripts, withContentSecurityPolicy } from './csp.js';
export default {
  async fetch(request) {
    const { op, html, init } = await request.json();
    if (op === 'scripts') return Response.json(await inlineScripts(html));
    if (op === 'policy') return Response.json(await contentSecurityPolicy(html));
    const original = new Response(html, init);
    // 'wrap-boot' adds an inline loader, as the Worker's deferHydration does.
    const wrapped = await withContentSecurityPolicy(
      original,
      op === 'wrap-boot'
        ? (text) => text.replace('</body>', '<script>boot()</script></body>')
        : undefined
    );
    return Response.json({
      same: wrapped === original,
      status: wrapped.status,
      headers: Object.fromEntries(wrapped.headers),
      body: wrapped.body === null ? null : await wrapped.text(),
    });
  },
};`;

let worker: Miniflare | undefined;
async function call<T>(payload: unknown): Promise<T> {
  worker ??= new Miniflare({
    modules: [
      { type: 'ESModule', path: 'entry.mjs', contents: ENTRY },
      {
        type: 'ESModule',
        path: 'csp.js',
        contents: stripTypeScriptTypes(CSP_SOURCE),
      },
    ],
    // The newest date this workerd binary supports; HTMLRewriter (lol-html)
    // parsing is not compatibility-date gated.
    compatibilityDate: '2026-08-01',
  });
  const response = await worker.dispatchFetch('http://csp.test/', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  assert.equal(response.status, 200, await response.clone().text());
  return (await response.json()) as T;
}
after(() => worker?.dispose());

const inlineScripts = (html: string) => call<string[]>({ op: 'scripts', html });
const contentSecurityPolicy = (html: string) =>
  call<string>({ op: 'policy', html });
type Wrapped = {
  same: boolean;
  status: number;
  headers: Record<string, string>;
  body: string | null;
};
const withContentSecurityPolicy = (html: string | null, init: ResponseInit) =>
  call<Wrapped>({ op: 'wrap', html, init });
const withBootLoader = (html: string) =>
  call<Wrapped>({
    op: 'wrap-boot',
    html,
    init: { headers: { 'content-type': 'text/html; charset=utf-8' } },
  });

describe('content security policy', () => {
  const HTML =
    '<!doctype html><html><head><script>self.theme=1</script>' +
    '<script type="module" src="/roadmap/assets/index-Abcd1234.js"></script></head>' +
    '<body><div style="width:40%"></div><script>(self.$R=self.$R||{})</script >' +
    '<script></script></body></html>';

  it('hashes exactly the inline scripts and nothing broader', async () => {
    const scripts = await inlineScripts(HTML);
    assert.deepEqual(scripts, ['self.theme=1', '(self.$R=self.$R||{})']);
    const policy = await contentSecurityPolicy(HTML);
    const scriptSrc = policy.split('; ')[0] ?? '';
    for (const body of scripts) {
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
    const html = await withContentSecurityPolicy(HTML, {
      status: 404,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'content-length': '1',
      },
    });
    assert.equal(html.status, 404);
    assert.equal(html.body, HTML);
    assert.match(
      html.headers['content-security-policy'] ?? '',
      /^script-src 'self' 'sha256-/
    );
    assert.equal(html.headers['content-length'], undefined);
    const json = await withContentSecurityPolicy('{}', {
      headers: { 'content-type': 'application/json' },
    });
    assert.ok(json.same, 'non-HTML passes through as the same Response');
    assert.equal(json.headers['content-security-policy'], undefined);
    const head = await withContentSecurityPolicy(null, {
      headers: { 'content-type': 'text/html' },
    });
    assert.ok(head.headers['content-security-policy']);
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
  it('finds inline scripts whose end tags carry whitespace or attributes', async () => {
    assert.deepEqual(
      await inlineScripts(
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

  /**
   * The broken variant these tests must catch: #8084 read the whole document
   * as text, so any `<script>…</script>` substring counted. Plain substring
   * search, not an HTML-filtering regex.
   */
  const wholeDocumentScan = (html: string) => {
    const found: string[] = [];
    for (let at = html.indexOf('<script>'); at !== -1;) {
      const close = html.indexOf('</script>', at);
      if (close === -1) break;
      found.push(html.slice(at + '<script>'.length, close));
      at = html.indexOf('<script>', close);
    }
    return found;
  };

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
    ['noscript text', `<noscript><script>${injected}</script></noscript>`],
  ];
  for (const [name, snippet] of variants)
    it(`an attribute or text containing <script> is never hashed: ${name}`, async () => {
      const html = `<!doctype html><html><head><script>boot()</script></head><body>${snippet}<script>later()</script></body></html>`;
      assert.deepEqual(await inlineScripts(html), ['boot()', 'later()']);
      // The pre-seal doctor's independent tokenizer agrees.
      assert.deepEqual(inlineScriptTexts(html), ['boot()', 'later()']);
      const policy = await contentSecurityPolicy(html);
      assert.ok(
        !policy.includes(sha(injected)),
        'injected text must not be allowed'
      );
      assert.ok(
        policy.includes(sha('boot()')) && policy.includes(sha('later()'))
      );
    });

  it('broken variant: a whole-document scan hashes the attribute payload', async () => {
    // D79: the assertion above fails on #8084's text scan, so it can catch it.
    const html = `<div title="<script>${injected}</script>"></div>`;
    assert.deepEqual(wholeDocumentScan(html), [injected]);
    assert.deepEqual(await inlineScripts(html), []);
    assert.ok(!(await contentSecurityPolicy(html)).includes(sha(injected)));
  });

  it('src is an exact attribute name; data-src stays inline', async () => {
    const html =
      '<script src="/a.js"></script><script SRC=/b.js></script><script data-src="x">c()</script>';
    assert.deepEqual(await inlineScripts(html), ['c()']);
    assert.deepEqual(inlineScriptTexts(html), ['c()']);
  });

  it('keeps Unicode text aligned and matches tag names case-insensitively', async () => {
    const html =
      '<p>İstanbul Tiếng Việt</p><SCRIPT>d()</SCRIPT ><script>e()</script\nx>';
    assert.deepEqual(await inlineScripts(html), ['d()', 'e()']);
    assert.deepEqual(inlineScriptTexts(html), ['d()', 'e()']);
  });

  it('collects script text split across parser chunks', async () => {
    const body = `self.$R=${JSON.stringify('x'.repeat(200_000))}`;
    assert.deepEqual(await inlineScripts(`<script>${body}</script>`), [body]);
  });

  it('an unclosed script at end of file is not allowed', async () => {
    assert.deepEqual(await inlineScripts('<p>x</p><script>tail()'), []);
  });
});

describe('content security policy: oversized documents', () => {
  const page = (filler: number) =>
    '<!doctype html><html><head>' +
    '<script type="application/ld+json">{"@context":"https://schema.org"}</script>' +
    '<script>self.theme=1</script>' +
    '<script type="module" async="" src="/roadmap/assets/index-Abcd1234.js"></script>' +
    `</head><body>${'x'.repeat(filler)}<script>(self.$R=self.$R||{})</script></body></html>`;
  const executableInline = (html: string) =>
    // Case-insensitive, like browsers: <SCRIPT> and unquoted attributes count.
    [...html.matchAll(/<script\b([^>]*)>/gi)].filter(
      (match) =>
        !/\bsrc\s*=/i.test(match[1] ?? '') &&
        !/\btype\s*=\s*["']?application\/(ld\+)?json\b/i.test(match[1] ?? '')
    ).length;
  /** A fallback serves no unhashed executable script, but keeps the rest. */
  const degradesSafely = (result: Wrapped) =>
    result.headers['content-security-policy']?.startsWith(
      "script-src 'self';"
    ) === true &&
    executableInline(result.body ?? '') === 0 &&
    (result.body ?? '').includes('<script type="application/ld+json">') &&
    (result.body ?? '').includes(
      '<script type="module" async="" src="/roadmap/assets/index-Abcd1234.js">'
    );

  it('the inline-script counter sees any letter case and attribute quoting', () => {
    assert.equal(
      executableInline('<SCRIPT>x()</SCRIPT><Script >y()</Script>'),
      2
    );
    assert.equal(
      executableInline('<SCRIPT TYPE=application/ld+json>{}</SCRIPT>'),
      0
    );
    assert.equal(executableInline('<script SRC=/a.js></script>'), 0);
  });

  it('a normal page keeps the transform and hashes its inline scripts', async () => {
    const result = await withBootLoader(page(1_000));
    assert.ok(result.body?.includes('<script>boot()</script>'));
    const hash = createHash('sha256').update('boot()').digest('base64');
    assert.ok(
      result.headers['content-security-policy']?.includes(`'sha256-${hash}'`)
    );
  });

  it('an oversized page is served as rendered, minus its executable inline scripts', async () => {
    const original = page(MAX_DOCUMENT_BYTES + 1);
    const result = await withBootLoader(original);
    assert.equal(degradesSafely(result), true);
    assert.ok(!result.body?.includes('boot()'));
    // Broken variants: the untouched original (unhashed inline scripts
    // served), and the transformed page (an inline loader that is blocked).
    assert.equal(executableInline(original), 2);
    assert.equal(degradesSafely({ ...result, body: original }), false);
    assert.equal(
      degradesSafely({
        ...result,
        body: original.replace('</body>', '<script>boot()</script></body>'),
      }),
      false
    );
  });
});
