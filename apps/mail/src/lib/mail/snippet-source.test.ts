import { describe, expect, it } from 'vitest';
import { createSnippet } from './html';
import { cleanSnippetSource } from './snippet-source';

const LARAVEL_TEXT_PART = `@media only screen and (max-width: 600px) {
.inner-body {
width: 100% !important;
}

.footer {
width: 100% !important;
}
}

@media only screen and (max-width: 500px) {
.button {
width: 100% !important;
}
}
Kính gửi Quý khách hàng,

SePay xin trân trọng thông báo chính thức ra mắt SePay MCP.`;

describe('cleanSnippetSource', () => {
  it('drops stylesheet text that template engines put in the text part', () => {
    expect(cleanSnippetSource(LARAVEL_TEXT_PART)).toBe(
      'Kính gửi Quý khách hàng, SePay xin trân trọng thông báo chính thức ra mắt SePay MCP.'
    );
  });

  it('drops a single-line leaked stylesheet before the prose', () => {
    expect(
      cleanSnippetSource(
        '@media only screen and (max-width: 600px) { .inner-body { width: 100% !important; } } body, table { margin: 0; } Hello Team'
      )
    ).toBe('Hello Team');
  });

  it('removes style, script, head, title and comments from HTML', () => {
    const html = `<!doctype html><html><head><title>Ignored</title>
      <style type="text/css">.a{color:red}</style></head>
      <body><!-- tracking --><!--[if mso]><table><![endif]-->
      <script>alert(1)</script><p>Hello&nbsp;<b>there</b> &amp; welcome</p>
      <style>@media (max-width:1px){.b{display:none}}</style><p>Second</p></body></html>`;
    expect(cleanSnippetSource(html, { html: true })).toBe(
      'Hello there & welcome Second'
    );
  });

  it('removes unterminated hidden regions instead of leaking them', () => {
    expect(
      cleanSnippetSource('<p>Visible</p><style>.x{color:red}', { html: true })
    ).toBe('Visible');
    expect(
      cleanSnippetSource('<p>Visible</p><!-- open comment', { html: true })
    ).toBe('Visible');
  });

  it('keeps prose that contains braces or colons', () => {
    expect(
      cleanSnippetSource('Hi {first name}, your code is {1234}. Time: 10:00')
    ).toBe('Hi {first name}, your code is {1234}. Time: 10:00');
    expect(cleanSnippetSource('Hi a < b and c > d')).toBe('Hi a < b and c > d');
  });

  it('decodes numeric entities and strips invisible preheader padding', () => {
    expect(
      cleanSnippetSource('Caf&#233; &#x2014; ok\u200c\u200c\u00ad\u034f', {
        html: true,
      })
    ).toBe('Café — ok');
    expect(
      cleanSnippetSource('bad &#xFFFFFFF; &#0; &#xD800; stays', { html: true })
    ).toBe('bad &#xFFFFFFF; &#0; &#xD800; stays');
  });

  it('keeps prose that looks like declarations inside braces', () => {
    for (const prose of [
      'Meeting details {Time: 10:00, Room: A} see you',
      'Thanks. The details are {when: today} ok',
      'Price {total: 5} $',
      '@channel heads up {status: done} thanks',
      'Template syntax {name: value and the rest continues',
      'Write to me@media {now: please}',
      'Xin chào {tên: Phúc}, hẹn gặp lúc 10:00',
    ]) {
      expect(cleanSnippetSource(prose)).toBe(prose);
    }
  });

  it('keeps angle brackets and entities in plain text', () => {
    expect(
      cleanSnippetSource('John Doe <john@example.com> wrote: if x<y and y>z')
    ).toBe('John Doe <john@example.com> wrote: if x<y and y>z');
    expect(cleanSnippetSource('Literal &lt;style&gt; text')).toBe(
      'Literal &lt;style&gt; text'
    );
  });

  it('removes a truncated selector block and stays fast on hostile input', () => {
    expect(cleanSnippetSource('Hi there\n.inner-body { width: 100%...')).toBe(
      'Hi there'
    );
    const hostile = [
      '{'.repeat(20_000),
      'a{'.repeat(10_000),
      '.a{'.repeat(7_000),
      '<!['.repeat(7_000),
      '<!['.repeat(7_000).concat('x'.repeat(10_000)),
      `${'{'.repeat(5_000)}${'}'.repeat(5_000)}`,
    ];
    const started = performance.now();
    for (const input of hostile) {
      cleanSnippetSource(input);
      cleanSnippetSource(input, { html: true });
    }
    expect(performance.now() - started).toBeLessThan(250);
  });

  it('removes stylesheet runs cut anywhere in stored snippets', () => {
    const laravel = [
      '@media only screen and (max-width: 600px) {',
      '  .inner-body {',
      '    width: 100% !important;',
      '  }',
      '  .footer {',
      '    width: 100% !important;',
      '  }',
      '}',
      '@media only screen and (max-width: 500px) {',
      '  .button {',
      '    width: 100% !important;',
      '  }',
      '}',
      'Hello Team, your invoice is ready.',
    ].join('\n');
    const mjml =
      'table, td { border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt; } img { border:0;height:auto;line-height:100%; } Your order shipped today.';
    for (const source of [laravel, laravel.replaceAll('\n', ' '), mjml]) {
      for (let cut = 1; cut < source.length; cut += 1) {
        const stored = `${source.slice(0, cut)}...`;
        const cleaned = cleanSnippetSource(stored);
        const prose = source.slice(source.search(/Hello|Your/u));
        expect(
          cleaned === '' ||
            prose.startsWith(cleaned.replace(/\.\.\.$/u, '')) ||
            // A one-word cut header without selector punctuation reads as prose.
            /^[a-z]{1,8}\.\.\.$/u.test(cleaned),
          `cut ${cut}: ${cleaned}`
        ).toBe(true);
      }
    }
  });

  it('keeps prose around at-rule words and unknown properties', () => {
    for (const prose of [
      'Ping @page { see attached and the rest',
      'Reminder: @media team {all hands} at 3pm',
      'a { b: c and rest of message',
      'I { mean: it } truly',
      'div { reason: none } ok',
    ]) {
      expect(cleanSnippetSource(prose)).toBe(prose);
    }
  });

  it('handles data URLs in declarations and quoted angle brackets', () => {
    expect(
      cleanSnippetSource(
        '.a { background: url(data:image/png;base64,AAA) } Hello'
      )
    ).toBe('Hello');
    expect(cleanSnippetSource('<div title="a>b">X</div>', { html: true })).toBe(
      'X'
    );
  });

  it('handles empty input and bounds very long sources', () => {
    expect(cleanSnippetSource(null)).toBe('');
    expect(cleanSnippetSource('')).toBe('');
    expect(cleanSnippetSource(`${'a{'.repeat(30_000)}`).length).toBeLessThan(
      20_001
    );
  });
});

describe('createSnippet', () => {
  it('falls back to HTML when the text part is only stylesheet', () => {
    expect(
      createSnippet({
        text: '.inner-body { width: 100% !important; }',
        html: '<style>.a{}</style><p>Real preview</p>',
      })
    ).toBe('Real preview');
  });

  it('truncates the cleaned preview', () => {
    const snippet = createSnippet({
      text: `.a { color: red; } ${'x'.repeat(400)}`,
    });
    expect(snippet).toHaveLength(180);
    expect(snippet.startsWith('xxx')).toBe(true);
  });
});
