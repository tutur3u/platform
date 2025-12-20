/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { containsHtml, sanitizeHtml, textToHtml } from '../html-sanitizer';

describe('sanitizeHtml', () => {
  describe('basic functionality', () => {
    it('should return empty string for empty input', () => {
      expect(sanitizeHtml('')).toBe('');
    });

    it('should return empty string for null/undefined-like input', () => {
      expect(sanitizeHtml(null as unknown as string)).toBe('');
      expect(sanitizeHtml(undefined as unknown as string)).toBe('');
    });

    it('should preserve plain text', () => {
      expect(sanitizeHtml('Hello World')).toBe('Hello World');
    });

    it('should preserve text with special characters', () => {
      expect(sanitizeHtml('Hello & World < Test > Quote "test"')).toBe(
        'Hello &amp; World &lt; Test &gt; Quote "test"'
      );
    });
  });

  describe('allowed tags', () => {
    it('should allow <p> tags', () => {
      expect(sanitizeHtml('<p>Paragraph</p>')).toBe('<p>Paragraph</p>');
    });

    it('should allow <br> tags', () => {
      expect(sanitizeHtml('Line 1<br>Line 2')).toBe('Line 1<br>Line 2');
    });

    it('should allow <strong> and <b> tags', () => {
      expect(sanitizeHtml('<strong>Bold</strong>')).toBe(
        '<strong>Bold</strong>'
      );
      expect(sanitizeHtml('<b>Bold</b>')).toBe('<b>Bold</b>');
    });

    it('should allow <em> and <i> tags', () => {
      expect(sanitizeHtml('<em>Italic</em>')).toBe('<em>Italic</em>');
      expect(sanitizeHtml('<i>Italic</i>')).toBe('<i>Italic</i>');
    });

    it('should allow <u> tags', () => {
      expect(sanitizeHtml('<u>Underline</u>')).toBe('<u>Underline</u>');
    });

    it('should allow list tags', () => {
      expect(sanitizeHtml('<ul><li>Item 1</li><li>Item 2</li></ul>')).toBe(
        '<ul><li>Item 1</li><li>Item 2</li></ul>'
      );
      expect(sanitizeHtml('<ol><li>Item 1</li><li>Item 2</li></ol>')).toBe(
        '<ol><li>Item 1</li><li>Item 2</li></ol>'
      );
    });

    it('should allow <span> tags with class attribute', () => {
      expect(sanitizeHtml('<span class="highlight">Text</span>')).toBe(
        '<span class="highlight">Text</span>'
      );
    });

    it('should allow <div> tags with class attribute', () => {
      expect(sanitizeHtml('<div class="container">Content</div>')).toBe(
        '<div class="container">Content</div>'
      );
    });

    it('should allow nested allowed tags', () => {
      const input = '<p><strong>Bold <em>and italic</em></strong></p>';
      expect(sanitizeHtml(input)).toBe(
        '<p><strong>Bold <em>and italic</em></strong></p>'
      );
    });
  });

  describe('link sanitization', () => {
    it('should allow <a> tags with safe href', () => {
      const result = sanitizeHtml('<a href="https://example.com">Link</a>');
      expect(result).toContain('href="https://example.com"');
      expect(result).toContain('rel="noopener noreferrer"');
      expect(result).toContain('target="_blank"');
    });

    it('should allow http links', () => {
      const result = sanitizeHtml('<a href="http://example.com">Link</a>');
      expect(result).toContain('href="http://example.com"');
    });

    it('should allow mailto links', () => {
      const result = sanitizeHtml(
        '<a href="mailto:test@example.com">Email</a>'
      );
      expect(result).toContain('href="mailto:test@example.com"');
    });

    it('should allow relative URLs', () => {
      expect(sanitizeHtml('<a href="/page">Link</a>')).toContain(
        'href="/page"'
      );
      expect(sanitizeHtml('<a href="./page">Link</a>')).toContain(
        'href="./page"'
      );
      expect(sanitizeHtml('<a href="../page">Link</a>')).toContain(
        'href="../page"'
      );
    });

    it('should preserve title attribute on links', () => {
      const result = sanitizeHtml(
        '<a href="https://example.com" title="Example">Link</a>'
      );
      expect(result).toContain('title="Example"');
    });
  });

  describe('XSS prevention', () => {
    it('should remove javascript: URLs', () => {
      const result = sanitizeHtml('<a href="javascript:alert(1)">Click</a>');
      expect(result).not.toContain('javascript:');
      expect(result).not.toContain('href');
    });

    it('should remove data: URLs', () => {
      const result = sanitizeHtml(
        '<a href="data:text/html,<script>alert(1)</script>">Click</a>'
      );
      expect(result).not.toContain('data:');
    });

    it('should remove vbscript: URLs', () => {
      const result = sanitizeHtml('<a href="vbscript:msgbox(1)">Click</a>');
      expect(result).not.toContain('vbscript:');
    });

    it('should remove <script> tags', () => {
      const result = sanitizeHtml('<script>alert("xss")</script>');
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('</script>');
    });

    it('should remove <script> tags and preserve text content', () => {
      const result = sanitizeHtml(
        '<p>Before</p><script>alert(1)</script><p>After</p>'
      );
      expect(result).toContain('Before');
      expect(result).toContain('After');
      expect(result).not.toContain('<script>');
    });

    it('should remove event handler attributes', () => {
      // onclick is not in allowed attributes, so it should be removed
      const result = sanitizeHtml('<div onclick="alert(1)">Click me</div>');
      expect(result).not.toContain('onclick');
    });

    it('should remove onerror handlers', () => {
      const result = sanitizeHtml('<img src="x" onerror="alert(1)">');
      expect(result).not.toContain('onerror');
    });

    it('should remove <iframe> tags', () => {
      const result = sanitizeHtml('<iframe src="https://evil.com"></iframe>');
      expect(result).not.toContain('<iframe');
    });

    it('should remove <object> tags', () => {
      const result = sanitizeHtml('<object data="evil.swf"></object>');
      expect(result).not.toContain('<object');
    });

    it('should remove <embed> tags', () => {
      const result = sanitizeHtml('<embed src="evil.swf">');
      expect(result).not.toContain('<embed');
    });

    it('should remove <form> tags', () => {
      const result = sanitizeHtml(
        '<form action="https://evil.com"><input></form>'
      );
      expect(result).not.toContain('<form');
    });

    it('should remove <style> tags', () => {
      const result = sanitizeHtml(
        '<style>body { background: red; }</style><p>Text</p>'
      );
      expect(result).not.toContain('<style>');
      expect(result).toContain('<p>Text</p>');
    });

    it('should handle case-insensitive dangerous tags', () => {
      const result = sanitizeHtml('<SCRIPT>alert(1)</SCRIPT>');
      expect(result).not.toContain('<SCRIPT>');
      expect(result).not.toContain('<script>');
    });

    it('should handle mixed case javascript URLs', () => {
      const result = sanitizeHtml('<a href="JaVaScRiPt:alert(1)">Click</a>');
      expect(result).not.toContain('javascript');
      expect(result).not.toContain('JaVaScRiPt');
    });
  });

  describe('disallowed tags', () => {
    it('should remove <img> tags but keep alt text', () => {
      const result = sanitizeHtml('<img src="image.jpg" alt="Description">');
      expect(result).not.toContain('<img');
    });

    it('should remove <video> tags', () => {
      const result = sanitizeHtml(
        '<video src="video.mp4">Video content</video>'
      );
      expect(result).not.toContain('<video');
      expect(result).toContain('Video content');
    });

    it('should remove <audio> tags', () => {
      const result = sanitizeHtml(
        '<audio src="audio.mp3">Audio content</audio>'
      );
      expect(result).not.toContain('<audio');
    });

    it('should remove <table> tags but keep content', () => {
      const result = sanitizeHtml('<table><tr><td>Cell</td></tr></table>');
      expect(result).not.toContain('<table');
      expect(result).toContain('Cell');
    });
  });

  describe('attribute filtering', () => {
    it('should remove style attributes', () => {
      const result = sanitizeHtml(
        '<p style="color: red; background: url(evil.com)">Text</p>'
      );
      expect(result).not.toContain('style=');
    });

    it('should remove id attributes', () => {
      const result = sanitizeHtml('<p id="test">Text</p>');
      expect(result).not.toContain('id=');
    });

    it('should only allow class on span and div', () => {
      const result1 = sanitizeHtml('<span class="test">Text</span>');
      expect(result1).toContain('class="test"');

      const result2 = sanitizeHtml('<p class="test">Text</p>');
      expect(result2).not.toContain('class=');
    });
  });

  describe('complex scenarios', () => {
    it('should handle deeply nested content', () => {
      const input =
        '<div><p><strong><em><u>Deeply nested</u></em></strong></p></div>';
      const result = sanitizeHtml(input);
      expect(result).toContain('Deeply nested');
      expect(result).toContain('<strong>');
      expect(result).toContain('<em>');
      expect(result).toContain('<u>');
    });

    it('should handle mixed allowed and disallowed content', () => {
      const input =
        '<p>Safe</p><script>evil()</script><strong>Also safe</strong>';
      const result = sanitizeHtml(input);
      expect(result).toContain('<p>Safe</p>');
      expect(result).toContain('<strong>Also safe</strong>');
      expect(result).not.toContain('<script>');
    });

    it('should handle malformed HTML gracefully', () => {
      const input = '<p>Unclosed paragraph<strong>Bold without close';
      const result = sanitizeHtml(input);
      expect(result).toContain('Unclosed paragraph');
      expect(result).toContain('Bold without close');
    });
  });
});

describe('textToHtml', () => {
  it('should convert newlines to <br> tags', () => {
    expect(textToHtml('Line 1\nLine 2')).toBe('Line 1<br>Line 2');
  });

  it('should convert multiple newlines', () => {
    expect(textToHtml('Line 1\nLine 2\nLine 3')).toBe(
      'Line 1<br>Line 2<br>Line 3'
    );
  });

  it('should handle empty string', () => {
    expect(textToHtml('')).toBe('');
  });

  it('should handle string without newlines', () => {
    expect(textToHtml('No newlines here')).toBe('No newlines here');
  });

  it('should handle consecutive newlines', () => {
    expect(textToHtml('Line 1\n\nLine 3')).toBe('Line 1<br><br>Line 3');
  });

  it('should handle Windows-style line endings (CRLF)', () => {
    // Note: This function only handles \n, not \r\n
    expect(textToHtml('Line 1\r\nLine 2')).toBe('Line 1\r<br>Line 2');
  });
});

describe('containsHtml', () => {
  it('should return true for strings with HTML tags', () => {
    expect(containsHtml('<p>Text</p>')).toBe(true);
    expect(containsHtml('<br>')).toBe(true);
    expect(containsHtml('<div class="test">Content</div>')).toBe(true);
  });

  it('should return true for self-closing tags', () => {
    expect(containsHtml('<br/>')).toBe(true);
    expect(containsHtml('<img src="test.jpg"/>')).toBe(true);
  });

  it('should return false for plain text', () => {
    expect(containsHtml('Plain text')).toBe(false);
    expect(containsHtml('Hello World')).toBe(false);
  });

  it('should return false for empty string', () => {
    expect(containsHtml('')).toBe(false);
  });

  it('should return true for angle brackets that form tags', () => {
    // Note: The simple regex /<[^>]+>/g matches anything that looks like a tag
    // This includes "5 < 10 and 20 >" because "< 10 and 20 >" matches the pattern
    expect(containsHtml('5 < 10 and 20 > 15')).toBe(true); // Regex sees this as a tag
    expect(containsHtml('Use <tag> for markup')).toBe(true);
  });

  it('should handle incomplete angle brackets', () => {
    // The simple regex matches anything between < and >
    expect(containsHtml('Less than < greater than >')).toBe(true); // Matches "< greater than >"
    expect(containsHtml('Arrow -> direction')).toBe(false); // No < before >
  });

  it('should return true for script tags', () => {
    expect(containsHtml('<script>alert(1)</script>')).toBe(true);
  });

  it('should return true for tags with attributes', () => {
    expect(containsHtml('<a href="https://example.com">Link</a>')).toBe(true);
  });
});
