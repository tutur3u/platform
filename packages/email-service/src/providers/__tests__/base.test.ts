import { describe, expect, it } from 'vitest';
import { BaseEmailProvider } from '../base';

class TestEmailProvider extends BaseEmailProvider {
  name = 'test';
  async send() {
    return { success: true };
  }
  async validateCredentials() {
    return true;
  }
  html(value: string) {
    return this.sanitizeHtml(value);
  }
  plainText(value: string) {
    return this.htmlToPlainText(value);
  }
}

const provider = new TestEmailProvider();
const report = `<!doctype html><html><head>
<meta charset="utf-8"><title>Hidden document title</title>
<style>.report{color:#123456}</style></head><body>
<table><tr><td colspan="2"><h1 class="report">Monthly report</h1></td></tr>
<tr><td rowspan="2">Lessons</td><td>Score: 93</td></tr></table>
</body></html>`;

describe('email provider document conversion', () => {
  it('discards document titles while retaining report headings and table layout', async () => {
    const result = await provider.html(report);
    expect(result).not.toContain('Hidden document title');
    expect(result).toContain('Monthly report');
    expect(result).toContain('colspan="2"');
    expect(result).toContain('rowspan="2"');
    expect(result).toMatch(/color: ?#123456/);
  });

  it.each(['title', 'textarea', 'option', 'script', 'style'])(
    'keeps visible text after a comment mentioning %s',
    (tag) => {
      expect(
        provider.plainText(
          `<!-- <${tag}> is only an example --><h1>Monthly report</h1>`
        )
      ).toBe('Monthly report');
    }
  );

  it('does not interpret attribute values as hidden blocks', () => {
    expect(
      provider.plainText('<p title="Example <textarea> tag">Visible report</p>')
    ).toBe('Visible report');
  });

  it('preserves links and decodes escaped text once', () => {
    expect(
      provider.plainText(
        '<p>A &amp; B &amp;lt;tag&amp;gt;</p><a href="https://example.com?a=1&amp;b=2">Open</a>'
      )
    ).toBe('A & B &lt;tag&gt;\n\nOpen (https://example.com?a=1&b=2)');
  });

  it.each([
    'tel:+84123456789',
    'cid:report@example.test',
    'mailto:parent@example.test',
    'ftp://example.test/report',
    'custom-app://reports/1',
  ])('preserves the %s address in plain text', (href) => {
    expect(provider.plainText(`<a href="${href}">Open</a>`)).toBe(
      `Open (${href})`
    );
  });

  it('keeps the URL safety filter on rendered HTML', async () => {
    const html = await provider.html('<a href="javascript:alert(1)">Open</a>');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('Open');
  });

  it('omits head metadata from the plain-text alternative', () => {
    const result = provider.plainText(report);
    expect(result).not.toContain('Hidden document title');
    expect(result).not.toContain('.report');
    expect(result).toContain('Monthly report');
    expect(result).toContain('Score: 93');
  });

  it('retains body text when a sender omits the closing head tag', () => {
    expect(
      provider.plainText(
        '<head><title>Hidden</title><body><h1>Monthly report</h1>'
      )
    ).toBe('Monthly report');
  });

  it('preserves visible header text in plain-text email', () => {
    expect(
      provider.plainText('<header>Visible heading</header><p>Body</p>')
    ).toBe('Visible headingBody');
  });

  it.each(['textarea', 'option'])(
    'discards %s contents in both alternatives',
    async (tag) => {
      const fragment = `<${tag}>Hidden control text</${tag}><h1>Monthly report</h1>`;
      expect(await provider.html(fragment)).not.toContain(
        'Hidden control text'
      );
      expect(provider.plainText(fragment)).toBe('Monthly report');
    }
  );

  it.each(['title', 'TiTlE'])(
    'discards %s text from HTML fragments',
    async (tag) => {
      const fragment = `<${tag}>Hidden document title</${tag}><h1>Monthly report</h1>`;
      expect(await provider.html(fragment)).not.toContain(
        'Hidden document title'
      );
      expect(provider.plainText(fragment)).toBe('Monthly report');
    }
  );
});
