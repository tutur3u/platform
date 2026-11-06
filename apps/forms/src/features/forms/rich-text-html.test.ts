import { describe, expect, it } from 'vitest';

import {
  RICH_TEXT_ALLOWED_ATTR,
  RICH_TEXT_ALLOWED_SCHEMES,
  RICH_TEXT_ALLOWED_TAGS,
  sanitizeFormsRichTextHtml,
} from './rich-text-html';

const OBFUSCATED_JAVASCRIPT_HREFS = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  ' javascript:alert(1)',
  'java\tscript:alert(1)',
  'java&#x09;script:alert(1)',
  'jav&#x0A;ascript:alert(1)',
  'java&#13;script:alert(1)',
  '&#106;avascript:alert(1)',
  '&#x6A;&#x61;&#x76;&#x61;script:alert(1)',
  'vbscript:msgbox(1)',
];

const MUTATION_PAYLOADS = [
  '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
  '<math><mi xlink:href="javascript:alert(1)">x</mi></math>',
  '<svg><style><img src=x onerror=alert(1)></style></svg>',
  '<svg/><img src=x onerror=alert(1)>',
  '<textarea><img src=x onerror=alert(1)></textarea>',
  '<svg><textarea><img src=x onerror=alert(1)></textarea></svg>',
  '<textarea></textarea/><img src=x onerror=alert(1)>',
  '<iframe src="javascript:alert(1)"><img src=x onerror=alert(1)></iframe>',
  '<iframe><p>unclosed fallback <a href="javascript:alert(1)">x</a>',
  '<object data="javascript:alert(1)"><p>obj</p></object><embed src=x>',
  '<noscript><p title="</noscript><img src=x onerror=alert(1)>"></noscript>',
  '<template><img src=x onerror=alert(1)></template>',
  '<a href="data:text/html,<script>alert(1)</script>">d</a>',
  '<p src="data:image/svg+xml,<svg onload=alert(1)>">p</p>',
  '<img src=x onerror=alert(1) style="background:url(javascript:alert(1))">',
  ...OBFUSCATED_JAVASCRIPT_HREFS.map((href) => `<a href="${href}">x</a>`),
];

const isAllowedAttribute = (name: string) =>
  RICH_TEXT_ALLOWED_ATTR.includes(name) || /^(?:aria|data)-/u.test(name);

/** Re-parses sanitizer output in the DOM and inspects what a browser keeps. */
function inspectReparsed(html: string) {
  const template = document.createElement('template');
  template.innerHTML = html;
  const elements = [...template.content.querySelectorAll('*')];

  for (const element of elements) {
    expect(RICH_TEXT_ALLOWED_TAGS).toContain(element.localName);
    expect(element.namespaceURI).toBe('http://www.w3.org/1999/xhtml');
    for (const { name, value } of element.attributes) {
      expect(isAllowedAttribute(name), name).toBe(true);
      if (name !== 'href' && name !== 'src') continue;
      const { protocol } = new URL(value, 'https://forms.tuturuuu.com/');
      const scheme = protocol.slice(0, -1);
      const allowed =
        name === 'src' && element.localName === 'img'
          ? [...RICH_TEXT_ALLOWED_SCHEMES, 'data']
          : RICH_TEXT_ALLOWED_SCHEMES;
      expect(allowed, `${name}=${value}`).toContain(scheme);
    }
  }

  // A second browser parse must be stable, or markup mutated on reparse.
  const reparsed = document.createElement('template');
  reparsed.innerHTML = template.innerHTML;
  expect(reparsed.innerHTML).toBe(template.innerHTML);
  return elements;
}

describe('sanitizeFormsRichTextHtml', () => {
  it.each(OBFUSCATED_JAVASCRIPT_HREFS)(
    'drops the obfuscated script href %j',
    (href) => {
      expect(sanitizeFormsRichTextHtml(`<a href="${href}">x</a>`)).toBe(
        '<a>x</a>'
      );
    }
  );

  it('accepts data URIs only on images', () => {
    expect(
      sanitizeFormsRichTextHtml(
        '<a href="data:text/html,x">a</a><p src="data:image/png;base64,AA">p</p><img src="data:image/png;base64,AA">'
      )
    ).toBe('<a>a</a><p>p</p><img src="data:image/png;base64,AA" />');
  });

  it('keeps DOMPurify author schemes and aria/data attributes', () => {
    const schemes = ['sms:1', 'callto:x', 'ftps://x', 'xmpp:x', 'matrix:u/x'];
    for (const href of [...schemes, 'cid:x', 'mailto:a@b.c', 'tel:1', '/p']) {
      expect(sanitizeFormsRichTextHtml(`<a href="${href}">x</a>`)).toBe(
        `<a href="${href}">x</a>`
      );
    }
    expect(
      sanitizeFormsRichTextHtml(
        '<p aria-label="l" data-step="2" onclick="x" style="color:red" class="c" id="i">p</p>'
      )
    ).toBe('<p aria-label="l" data-step="2">p</p>');
  });

  it('drops discarded foreign and embedded subtrees with their content', () => {
    expect(
      sanitizeFormsRichTextHtml(
        '<svg><p>svg</p></svg><math><mi>m</mi></math><iframe><p>fallback</p></iframe><object><p>obj</p></object><textarea>t</textarea><div><u>kept</u></div><p>after</p>'
      )
    ).toBe('<u>kept</u><p>after</p>');
  });

  it.each(MUTATION_PAYLOADS)(
    'neutralizes %j after a browser reparse',
    (input) => {
      const output = sanitizeFormsRichTextHtml(input);
      inspectReparsed(output);
      expect(output).not.toMatch(
        /on\w+=|javascript:|vbscript:|<script|<style/iu
      );
    }
  );

  it('round-trips allowed rich text through a browser reparse', () => {
    const elements = inspectReparsed(
      sanitizeFormsRichTextHtml(
        '<h1>T</h1><p><a href="https://tuturuuu.com" target="_blank" rel="noopener" aria-label="home">l</a></p><ul><li><s>x</s></li></ul><pre><code>c</code></pre><img src="https://x.test/a.png" alt="a">'
      )
    );
    expect(elements.map((element) => element.localName)).toEqual([
      'h1',
      'p',
      'a',
      'ul',
      'li',
      's',
      'pre',
      'code',
      'img',
    ]);
  });
});
