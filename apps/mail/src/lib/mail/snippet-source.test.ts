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

  it('strips hidden regions whose attributes contain <', () => {
    expect(
      cleanSnippetSource(
        '<style media="(width < 600px)">.a { color: red; }</style>Hello',
        { html: true }
      )
    ).toBe('Hello');
    expect(
      cleanSnippetSource(
        '<script data-condition="1 < 2">window.boot();</script>Hello',
        { html: true }
      )
    ).toBe('Hello');
  });

  it('keeps stripping hidden regions, doctypes and url() bodies with odd characters', () => {
    const html = (value: string) => cleanSnippetSource(value, { html: true });
    expect(
      html("<script data-owner=O'Reilly>window.boot();</script>Hello")
    ).toBe('Hello');
    expect(html('<!DOCTYPE html PUBLIC "a<b">Hello')).toBe('Hello');
    const long = 'x'.repeat(2_001);
    expect(
      html(`<title data-template="${long}">Internal title</title>Hello`)
    ).toBe('Hello');
    expect(
      html(`<!DOCTYPE html SYSTEM "https://example.test/${long}">Hello`)
    ).toBe('Hello');
    expect(
      cleanSnippetSource(
        `.a { background: url("https://example.test/${'\u{1F600}'.repeat(1_001)}/{x}") } Hello`
      )
    ).toBe('Hello');
    expect(
      cleanSnippetSource(
        '.a { background: url("data:text/plain,{hello}") } Hello'
      )
    ).toBe('Hello');
    expect(
      cleanSnippetSource(
        '@font-face { src: url("data:font/woff,{hello}") } Hello'
      )
    ).toBe('Hello');
  });

  it('closes each hidden element with its own tag in any case', () => {
    const html = (value: string) => cleanSnippetSource(value, { html: true });
    expect(html('<SCRIPT type="x">a()</script >Hello')).toBe('Hello');
    expect(html('<Style>.a{}</STYLE>Hi <title>T</Title>there')).toBe(
      'Hi there'
    );
    expect(html('<head><title>T</title></head>Body')).toBe('Body');
    expect(html('<xml>x</noscript>still hidden')).toBe('');
    // The /iu opener case-folds U+017F to s; its closer must still match.
    expect(html('<\u017Fcript>placeholder</script>Visible')).toBe('Visible');
  });

  it('removes a truncated selector block', () => {
    expect(cleanSnippetSource('Hi there\n.inner-body { width: 100%...')).toBe(
      'Hi there'
    );
  });

  it('scales linearly on hostile input', () => {
    // Each generator builds a hostile input of length n. Cost is compared at
    // n and 8n inside the same process, so runner speed cancels out: a linear
    // pass costs about 8x (up to about 13x where a url() scan reaches its
    // 2,000 code point bound), a quadratic pass about 64x, and the bound is 32x.
    const hostile: Record<string, (n: number) => string> = {
      braces: (n) => '{'.repeat(n),
      selectorBraces: (n) => 'a{'.repeat(n / 2),
      classBraces: (n) => '.a{'.repeat(n / 3),
      conditionalOpeners: (n) => '<!['.repeat(n / 3),
      conditionalThenText: (n) => '<!['.repeat(n / 6).concat('x'.repeat(n / 2)),
      balancedBraces: (n) => `${'{'.repeat(n / 2)}${'}'.repeat(n / 2)}`,
      unterminatedStyle: (n) => '<style'.repeat(n / 6),
      unterminatedHead: (n) => '<head a'.repeat(n / 7),
      unterminatedDoctype: (n) => '<!doctype'.repeat(n / 9),
      unterminatedComment: (n) => '<!--'.repeat(n / 4),
      quotedTagOpeners: (n) => '<a"'.repeat(n / 3),
      declarationRuns: (n) => 'a{b:'.repeat(n / 4),
      nestedSelectorBlocks: (n) => `${'a{'.repeat(n / 4)}${'}'.repeat(n / 4)}`,
      nestedAtRules: (n) =>
        `${'@media a{'.repeat(n / 20)}${'}'.repeat(n / 20)}`,
      rejectedNestedAtRules: (n) =>
        `${'@media x{q '.repeat(n / 22)}${'}'.repeat(n / 22)}`,
      nestedDeclarations: (n) =>
        `${'a{b:c;'.repeat(n / 12)}${'}'.repeat(n / 12)}`,
      unclosedUrls: (n) => `a{b:${'url('.repeat(Math.floor((n - 5) / 4))}}`,
      unclosedTagThenText: (n) => `<style a${'x'.repeat(n - 9)}`,
      quotedStyleOpeners: (n) => '<style "'.repeat(n / 8),
      openQuoteStyle: (n) => "<style '".concat('<style'.repeat(n / 6)),
    };
    const measure = (input: string, html: boolean, reps: number) => {
      const started = performance.now();
      for (let call = 0; call < reps; call += 1) {
        cleanSnippetSource(input, { html });
      }
      return performance.now() - started;
    };
    // Repetitions are calibrated so the small input takes a measurable time,
    // small and large samples are interleaved, and the median of three
    // trials is kept, so pauses and frequency changes on a busy runner do not
    // decide the ratio.
    const ratioFor = (build: (n: number) => string, html: boolean) => {
      const smallInput = build(small);
      const largeInput = build(large);
      measure(largeInput, html, 2);
      let reps = 1;
      while (measure(smallInput, html, reps) < 1.5 && reps < 4_096) reps *= 2;
      const ratios: number[] = [];
      for (let trial = 0; trial < 3; trial += 1) {
        let smallBest = Number.POSITIVE_INFINITY;
        let largeBest = Number.POSITIVE_INFINITY;
        for (let sample = 0; sample < 2; sample += 1) {
          smallBest = Math.min(smallBest, measure(smallInput, html, reps));
          largeBest = Math.min(largeBest, measure(largeInput, html, reps));
        }
        ratios.push(largeBest / smallBest);
      }
      return ratios.sort((left, right) => left - right)[1] ?? 0;
    };
    // 20,000 is the length cleanSnippetSource keeps, so 8n stays in range.
    const small = 2_500;
    const large = 20_000;
    for (const [name, build] of Object.entries(hostile)) {
      for (const html of [false, true]) {
        const ratio = ratioFor(build, html);
        expect({ name, html, linear: ratio < 32 }).toEqual({
          name,
          html,
          linear: true,
        });
      }
    }
  }, 30_000);

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
