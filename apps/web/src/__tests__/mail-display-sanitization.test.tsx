import { MailDisplay } from '../app/[locale]/(dashboard)/[wsId]/mail/_components/mail-display';
import '@testing-library/jest-dom/vitest';
import { render, screen, waitFor } from '@testing-library/react';
import type { InternalEmail } from '@tuturuuu/types/db';
import DOMPurify from 'dompurify';
import sanitizeHtml from 'sanitize-html';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock next-intl
vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => 'en',
}));

// Mock dayjs
vi.mock('dayjs', () => {
  const mockDayjs = Object.assign(
    vi.fn(() => ({
      locale: vi.fn().mockReturnThis(),
      format: vi.fn().mockReturnValue('January 1, 2024 12:00 AM'),
    })),
    {
      extend: vi.fn(),
      locale: vi.fn(),
    }
  );
  return { default: mockDayjs };
});

// Mock dayjs plugins
vi.mock('dayjs/locale/vi', () => ({}));
vi.mock('dayjs/plugin/localizedFormat', () => ({ default: vi.fn() }));
vi.mock('dayjs/plugin/relativeTime', () => ({ default: vi.fn() }));

// Mock DOMPurify
vi.mock('dompurify', () => ({
  default: {
    sanitize: vi.fn(),
  },
}));

// Mock sanitize-html
vi.mock('sanitize-html', () => ({
  default: vi.fn(),
}));

describe('MailDisplay - HTML Sanitization', () => {
  const createMockMail = (
    overrides: Partial<InternalEmail> = {}
  ): InternalEmail => ({
    id: '1',
    user_id: '1',
    ws_id: '1',
    source_email: 'John Doe <john@example.com>',
    to_addresses: ['jane@example.com'],
    cc_addresses: [],
    bcc_addresses: [],
    reply_to_addresses: [],
    payload: '<p>Test content</p>',
    html_payload: true,
    created_at: '2024-01-01T12:00:00Z',
    subject: 'Test Subject',
    ...overrides,
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(DOMPurify.sanitize).mockReturnValue('<p>Sanitized content</p>');
    vi.mocked(sanitizeHtml).mockReturnValue(
      '<p>Fallback sanitized content</p>'
    );
  });

  describe('HTML Sanitization', () => {
    it('should sanitize HTML content using DOMPurify', async () => {
      const mailWithHtml = createMockMail({
        payload: '<p>Hello <script>alert("xss")</script>World</p>',
      });

      vi.mocked(DOMPurify.sanitize).mockReturnValue('<p>Hello World</p>');

      render(<MailDisplay mail={mailWithHtml} />);

      await waitFor(() => {
        expect(vi.mocked(DOMPurify.sanitize)).toHaveBeenCalledWith(
          '<p>Hello <script>alert("xss")</script>World</p>'
        );
      });

      expect(screen.queryByText('loading_email_content')).toBeNull();
    });

    it('should fall back to sanitize-html when DOMPurify fails', async () => {
      const mailWithHtml = createMockMail({
        payload: '<p>Content with potential issues</p>',
      });

      // Make DOMPurify throw an error
      vi.mocked(DOMPurify.sanitize).mockImplementation(() => {
        throw new Error('DOMPurify failed');
      });

      vi.mocked(sanitizeHtml).mockReturnValue(
        '<p>Content with potential issues</p>'
      );

      render(<MailDisplay mail={mailWithHtml} />);

      await waitFor(() => {
        expect(vi.mocked(DOMPurify.sanitize)).toHaveBeenCalled();
        expect(vi.mocked(sanitizeHtml)).toHaveBeenCalledWith(
          '<p>Content with potential issues</p>'
        );
      });
    });

    it('should handle various types of malicious HTML', async () => {
      const maliciousHtml = `
        <p>Normal content</p>
        <script>alert('xss')</script>
        <img src="x" onerror="alert('xss')">
        <a href="javascript:alert('xss')">Click me</a>
        <iframe src="javascript:alert('xss')"></iframe>
        <object data="javascript:alert('xss')"></object>
      `;

      const mailWithMaliciousHtml = createMockMail({
        payload: maliciousHtml,
      });

      const sanitizedHtml = '<p>Normal content</p><a>Click me</a>';
      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitizedHtml);

      render(<MailDisplay mail={mailWithMaliciousHtml} />);

      await waitFor(() => {
        expect(vi.mocked(DOMPurify.sanitize)).toHaveBeenCalledWith(
          maliciousHtml
        );
      });

      // Verify loading state is gone
      expect(screen.queryByText('loading_email_content')).toBeNull();
    });

    it('should handle HTML with style attributes and CSS injection attempts', async () => {
      const htmlWithStyles = `
        <p style="color: red; background: url(javascript:alert('xss'))">Styled text</p>
        <div style="expression(alert('xss'))">IE specific attack</div>
        <span style="color: blue;">Safe styling</span>
      `;

      const mailWithStyledHtml = createMockMail({
        payload: htmlWithStyles,
      });

      const sanitizedHtml =
        '<p style="color: red;">Styled text</p><span style="color: blue;">Safe styling</span>';
      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitizedHtml);

      render(<MailDisplay mail={mailWithStyledHtml} />);

      await waitFor(() => {
        expect(vi.mocked(DOMPurify.sanitize)).toHaveBeenCalledWith(
          htmlWithStyles
        );
      });
    });

    it('should handle empty or null content gracefully', async () => {
      const mailWithEmptyText = createMockMail({
        payload: '',
      });

      render(<MailDisplay mail={mailWithEmptyText} />);

      await waitFor(() => {
        expect(vi.mocked(DOMPurify.sanitize)).not.toHaveBeenCalled();
        expect(vi.mocked(sanitizeHtml)).not.toHaveBeenCalled();
      });

      expect(screen.queryByText('loading_email_content')).toBeNull();
    });

    it('should handle null mail gracefully', () => {
      render(<MailDisplay mail={null} />);

      expect(screen.getByText('no_email_selected')).toBeDefined();
      expect(screen.getByText('choose_email_message')).toBeDefined();
      expect(vi.mocked(DOMPurify.sanitize)).not.toHaveBeenCalled();
      expect(vi.mocked(sanitizeHtml)).not.toHaveBeenCalled();
    });

    it('should preserve safe HTML formatting', async () => {
      const safeHtml = `
        <h1>Email Subject</h1>
        <p>This is a <strong>bold</strong> and <em>italic</em> text.</p>
        <ul>
          <li>List item 1</li>
          <li>List item 2</li>
        </ul>
        <blockquote>This is a quote</blockquote>
        <code>console.log('code')</code>
      `;

      const mailWithSafeHtml = createMockMail({
        payload: safeHtml,
      });

      vi.mocked(DOMPurify.sanitize).mockReturnValue(safeHtml);

      render(<MailDisplay mail={mailWithSafeHtml} />);

      await waitFor(() => {
        expect(vi.mocked(DOMPurify.sanitize)).toHaveBeenCalledWith(safeHtml);
      });
    });

    it('should handle complex nested HTML structures', async () => {
      const complexHtml = `
        <div class="email-content">
          <table>
            <tr>
              <td>
                <div>
                  <p>Nested <span>content</span> with <a href="https://example.com">links</a></p>
                  <img src="https://example.com/image.jpg" alt="Test image">
                </div>
              </td>
            </tr>
          </table>
        </div>
      `;

      const mailWithComplexHtml = createMockMail({
        payload: complexHtml,
      });

      const sanitizedComplexHtml = `
        <div>
          <table>
            <tr>
              <td>
                <div>
                  <p>Nested <span>content</span> with <a href="https://example.com">links</a></p>
                  <img src="https://example.com/image.jpg" alt="Test image">
                </div>
              </td>
            </tr>
          </table>
        </div>
      `;

      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitizedComplexHtml);

      render(<MailDisplay mail={mailWithComplexHtml} />);

      await waitFor(() => {
        expect(vi.mocked(DOMPurify.sanitize)).toHaveBeenCalledWith(complexHtml);
      });
    });

    it('should handle URLs with potential XSS in href attributes', async () => {
      const htmlWithMaliciousUrls = `
        <a href="javascript:alert('xss')">Malicious link</a>
        <a href="data:text/html,<script>alert('xss')</script>">Data URL attack</a>
        <a href="https://example.com">Safe link</a>
        <form action="javascript:alert('xss')">
          <input type="submit" value="Submit">
        </form>
      `;

      const mailWithMaliciousUrls = createMockMail({
        payload: htmlWithMaliciousUrls,
      });

      const sanitizedUrls =
        '<a>Malicious link</a><a>Data URL attack</a><a href="https://example.com">Safe link</a>';
      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitizedUrls);

      render(<MailDisplay mail={mailWithMaliciousUrls} />);

      await waitFor(() => {
        expect(vi.mocked(DOMPurify.sanitize)).toHaveBeenCalledWith(
          htmlWithMaliciousUrls
        );
      });
    });

    it('should handle SVG with potential script injection', async () => {
      const htmlWithSvg = `
        <svg>
          <script>alert('xss')</script>
          <circle cx="50" cy="50" r="40" stroke="black" fill="red" />
        </svg>
        <svg onload="alert('xss')">
          <rect width="100" height="100" />
        </svg>
      `;

      const mailWithSvg = createMockMail({
        payload: htmlWithSvg,
      });

      const sanitizedSvg = `
        <svg>
          <circle cx="50" cy="50" r="40" stroke="black" fill="red" />
        </svg>
        <svg>
          <rect width="100" height="100" />
        </svg>
      `;
      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitizedSvg);

      render(<MailDisplay mail={mailWithSvg} />);

      await waitFor(() => {
        expect(vi.mocked(DOMPurify.sanitize)).toHaveBeenCalledWith(htmlWithSvg);
      });
    });

    it('should handle both DOMPurify and sanitize-html failures gracefully', async () => {
      const mailWithHtml = createMockMail({
        payload: '<p>Content that causes both sanitizers to fail</p>',
      });

      // Make both sanitizers fail
      vi.mocked(DOMPurify.sanitize).mockImplementation(() => {
        throw new Error('DOMPurify failed');
      });

      vi.mocked(sanitizeHtml).mockImplementation(() => {
        throw new Error('sanitize-html failed');
      });

      // Suppress console.error for this test
      const consoleSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      render(<MailDisplay mail={mailWithHtml} />);

      await waitFor(() => {
        expect(vi.mocked(DOMPurify.sanitize)).toHaveBeenCalled();
      });

      // Wait for the fallback attempt
      await waitFor(() => {
        expect(vi.mocked(sanitizeHtml)).toHaveBeenCalled();
      });

      // Should log the error
      await waitFor(() => {
        expect(consoleSpy).toHaveBeenCalledWith(
          'Failed to sanitize HTML:',
          expect.any(Error)
        );
      });

      // Should not crash and should finish loading
      await waitFor(() => {
        expect(screen.queryByText('loading_email_content')).toBeNull();
      });

      consoleSpy.mockRestore();
    });
  });

  describe('Advanced Security Scenarios', () => {
    it('should handle HTML entities that could decode to malicious content', async () => {
      const htmlWithEntities = `
        &lt;script&gt;alert('xss')&lt;/script&gt;
        &#60;img src=x onerror=alert('xss')&#62;
        &#x3C;iframe src=javascript:alert('xss')&#x3E;
        <p>Normal &amp; safe content</p>
      `;

      const mailWithEntities = createMockMail({
        payload: htmlWithEntities,
      });

      const sanitizedEntities = '<p>Normal &amp; safe content</p>';
      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitizedEntities);

      render(<MailDisplay mail={mailWithEntities} />);

      await waitFor(() => {
        expect(vi.mocked(DOMPurify.sanitize)).toHaveBeenCalledWith(
          htmlWithEntities
        );
      });
    });

    it('should handle meta refresh redirects and CSP bypass attempts', async () => {
      const htmlWithMetaRefresh = `
        <meta http-equiv="refresh" content="0;url=javascript:alert('xss')">
        <meta http-equiv="refresh" content="0;url=data:text/html,<script>alert('xss')</script>">
        <meta charset="utf-8">
        <style>@import "javascript:alert('xss')";</style>
        <link rel="stylesheet" href="javascript:alert('xss')">
      `;

      const mailWithMetaRefresh = createMockMail({
        payload: htmlWithMetaRefresh,
      });

      const sanitizedMeta = '<meta charset="utf-8">';
      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitizedMeta);

      render(<MailDisplay mail={mailWithMetaRefresh} />);

      await waitFor(() => {
        expect(vi.mocked(DOMPurify.sanitize)).toHaveBeenCalledWith(
          htmlWithMetaRefresh
        );
      });
    });

    it('should handle comprehensive event handler injection attempts', async () => {
      const htmlWithEventHandlers = `
        <div onclick="alert('xss')" onmouseover="alert('xss')" onload="alert('xss')">
          <p onmouseout="alert('xss')" onfocus="alert('xss')">Text</p>
          <img src="valid.jpg" onerror="alert('xss')" onload="alert('xss')">
          <input type="text" onfocus="alert('xss')" onchange="alert('xss')">
          <form onsubmit="alert('xss')">
            <button onclick="alert('xss')">Click</button>
          </form>
          <body onload="alert('xss')">
          <iframe onload="alert('xss')" src="about:blank"></iframe>
        </div>
      `;

      const mailWithEventHandlers = createMockMail({
        payload: htmlWithEventHandlers,
      });

      const sanitizedEventHandlers = `
        <div>
          <p>Text</p>
          <img src="valid.jpg">
          <input type="text">
          <form>
            <button>Click</button>
          </form>
          <iframe src="about:blank"></iframe>
        </div>
      `;
      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitizedEventHandlers);

      render(<MailDisplay mail={mailWithEventHandlers} />);

      await waitFor(() => {
        expect(vi.mocked(DOMPurify.sanitize)).toHaveBeenCalledWith(
          htmlWithEventHandlers
        );
      });
    });

    it('should handle base64 encoded malicious content', async () => {
      const htmlWithBase64 = `
        <img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoJ3hzcycpPjwvc3ZnPg==">
        <iframe src="data:text/html;base64,PHNjcmlwdD5hbGVydCgneHNzJyk8L3NjcmlwdD4="></iframe>
        <a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgneHNzJyk8L3NjcmlwdD4=">Click</a>
        <object data="data:text/html;base64,PHNjcmlwdD5hbGVydCgneHNzJyk8L3NjcmlwdD4="></object>
      `;

      const mailWithBase64 = createMockMail({
        payload: htmlWithBase64,
      });

      const sanitizedBase64 = '<a>Click</a>';
      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitizedBase64);

      render(<MailDisplay mail={mailWithBase64} />);

      await waitFor(() => {
        expect(vi.mocked(DOMPurify.sanitize)).toHaveBeenCalledWith(
          htmlWithBase64
        );
      });
    });

    it('should handle CSS injection and expression attacks', async () => {
      const htmlWithCssInjection = `
        <style>
          body { background: url(javascript:alert('xss')); }
          .evil { behavior: url(evil.htc); }
          .expression { width: expression(alert('xss')); }
          @import "javascript:alert('xss')";
        </style>
        <div style="background: url('javascript:alert(\\'xss\\')'); behavior: url(evil.htc);">
          <p style="color: -moz-binding:url(xss.xml#xss);">Text</p>
        </div>
      `;

      const mailWithCssInjection = createMockMail({
        payload: htmlWithCssInjection,
      });

      const sanitizedCss = '<div><p>Text</p></div>';
      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitizedCss);

      render(<MailDisplay mail={mailWithCssInjection} />);

      await waitFor(() => {
        expect(vi.mocked(DOMPurify.sanitize)).toHaveBeenCalledWith(
          htmlWithCssInjection
        );
      });
    });

    it('should handle iframe, object, and embed tag injection', async () => {
      const htmlWithEmbeds = `
        <iframe src="javascript:alert('xss')"></iframe>
        <iframe srcdoc="<script>alert('xss')</script>"></iframe>
        <object data="javascript:alert('xss')"></object>
        <object data="data:text/html,<script>alert('xss')</script>"></object>
        <embed src="javascript:alert('xss')">
        <embed src="data:text/html,<script>alert('xss')</script>">
        <applet code="javascript:alert('xss')"></applet>
      `;

      const mailWithEmbeds = createMockMail({
        payload: htmlWithEmbeds,
      });

      const sanitizedEmbeds = '';
      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitizedEmbeds);

      render(<MailDisplay mail={mailWithEmbeds} />);

      await waitFor(() => {
        expect(vi.mocked(DOMPurify.sanitize)).toHaveBeenCalledWith(
          htmlWithEmbeds
        );
      });
    });

    it('should handle form injection and redirect attacks', async () => {
      const htmlWithForms = `
        <form action="javascript:alert('xss')" method="get">
          <input type="hidden" name="redirect" value="javascript:alert('xss')">
          <input type="submit" value="Submit">
        </form>
        <form action="data:text/html,<script>alert('xss')</script>">
          <button formaction="javascript:alert('xss')">Click</button>
        </form>
        <input type="image" src="x" formaction="javascript:alert('xss')">
      `;

      const mailWithForms = createMockMail({
        payload: htmlWithForms,
      });

      const sanitizedForms = `
        <form>
          <input type="hidden" name="redirect">
          <input type="submit" value="Submit">
        </form>
        <form>
          <button>Click</button>
        </form>
        <input type="image" src="x">
      `;
      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitizedForms);

      render(<MailDisplay mail={mailWithForms} />);

      await waitFor(() => {
        expect(vi.mocked(DOMPurify.sanitize)).toHaveBeenCalledWith(
          htmlWithForms
        );
      });
    });

    it('should handle Unicode and encoding-based attacks', async () => {
      const htmlWithUnicode = `
        <script>alert(\u0027xss\u0027)</script>
        <img src=\u0078 onerror=\u0061lert(\u0027xss\u0027)>
        <a href=\u006A\u0061\u0076\u0061\u0073\u0063\u0072\u0069\u0070\u0074:\u0061\u006C\u0065\u0072\u0074(\u0027\u0078\u0073\u0073\u0027)>Link</a>
        <%2Fscript><%2Fscript>alert('xss')<%2Fscript>
      `;

      const mailWithUnicode = createMockMail({
        payload: htmlWithUnicode,
      });

      const sanitizedUnicode = '<a>Link</a>';
      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitizedUnicode);

      render(<MailDisplay mail={mailWithUnicode} />);

      await waitFor(() => {
        expect(vi.mocked(DOMPurify.sanitize)).toHaveBeenCalledWith(
          htmlWithUnicode
        );
      });
    });

    it('should handle large content performance and potential DoS attacks', async () => {
      // Create a large HTML content that could cause performance issues
      const largeHtml = `
        <div>
          ${'<p>Repeated content</p>'.repeat(1000)}
          <script>alert('xss')</script>
          ${'<span>More content</span>'.repeat(1000)}
        </div>
      `;

      const mailWithLargeHtml = createMockMail({
        payload: largeHtml,
      });

      const sanitizedLarge =
        '<div>' +
        '<p>Repeated content</p>'.repeat(1000) +
        '<span>More content</span>'.repeat(1000) +
        '</div>';
      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitizedLarge);

      render(<MailDisplay mail={mailWithLargeHtml} />);

      await waitFor(() => {
        expect(vi.mocked(DOMPurify.sanitize)).toHaveBeenCalledWith(largeHtml);
      });
    });

    it('should handle realistic email HTML content with tracking pixels and external resources', async () => {
      const realisticEmailHtml = `
        <html>
          <head>
            <meta charset="utf-8">
            <style>
              .email-content { font-family: Arial, sans-serif; }
              .header { background: #f0f0f0; padding: 20px; }
            </style>
          </head>
          <body>
            <div class="email-content">
              <div class="header">
                <h1>Newsletter</h1>
              </div>
              <p>Dear Customer,</p>
              <p>Check out our latest offers!</p>
              <img src="https://example.com/tracking-pixel.gif?user=123" width="1" height="1">
              <a href="https://example.com/click?id=456">Click here</a>
              <img src="https://cdn.example.com/images/product.jpg" alt="Product">
              <table border="0" cellpadding="10">
                <tr>
                  <td>Product Name</td>
                  <td>$99.99</td>
                </tr>
              </table>
            </div>
          </body>
        </html>
      `;

      const mailWithRealisticHtml = createMockMail({
        payload: realisticEmailHtml,
      });

      const sanitizedRealistic = `
        <div>
          <div>
            <h1>Newsletter</h1>
          </div>
          <p>Dear Customer,</p>
          <p>Check out our latest offers!</p>
          <img src="https://example.com/tracking-pixel.gif?user=123" width="1" height="1">
          <a href="https://example.com/click?id=456">Click here</a>
          <img src="https://cdn.example.com/images/product.jpg" alt="Product">
          <table border="0" cellpadding="10">
            <tr>
              <td>Product Name</td>
              <td>$99.99</td>
            </tr>
          </table>
        </div>
      `;
      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitizedRealistic);

      render(<MailDisplay mail={mailWithRealisticHtml} />);

      await waitFor(() => {
        expect(vi.mocked(DOMPurify.sanitize)).toHaveBeenCalledWith(
          realisticEmailHtml
        );
      });
    });

    it('should handle mutation XSS and DOM clobbering attempts', async () => {
      const htmlWithMutation = `
        <div id="getElementById"></div>
        <img name="body">
        <form name="createElement">
          <input name="appendChild">
        </form>
        <div><div><div><div><div>
          <script>
            // This would normally attempt to manipulate the DOM
            document.getElementById = null;
          </script>
        </div></div></div></div></div>
      `;

      const mailWithMutation = createMockMail({
        payload: htmlWithMutation,
      });

      const sanitizedMutation = `
        <div id="getElementById"></div>
        <img name="body">
        <form name="createElement">
          <input name="appendChild">
        </form>
        <div><div><div><div><div>
        </div></div></div></div></div>
      `;
      vi.mocked(DOMPurify.sanitize).mockReturnValue(sanitizedMutation);

      render(<MailDisplay mail={mailWithMutation} />);

      await waitFor(() => {
        expect(vi.mocked(DOMPurify.sanitize)).toHaveBeenCalledWith(
          htmlWithMutation
        );
      });
    });
  });

  describe('Component Integration', () => {
    it('should render mail metadata correctly with sanitized content', async () => {
      const mail = createMockMail({
        source_email: 'Jane Smith <jane@example.com>',
        to_addresses: ['john@example.com'],
        cc_addresses: [],
        bcc_addresses: [],
        reply_to_addresses: [],
        subject: 'Important Message',
        payload: '<p>Hello <script>alert("xss")</script>there!</p>',
      });

      vi.mocked(DOMPurify.sanitize).mockReturnValue('<p>Hello there!</p>');

      render(<MailDisplay mail={mail} />);

      // Check mail metadata
      expect(screen.getByText('Jane Smith')).toBeDefined();
      expect(screen.getByText('Important Message')).toBeDefined();

      await waitFor(() => {
        expect(vi.mocked(DOMPurify.sanitize)).toHaveBeenCalled();
      });
    });

    it('should handle mail text changes and re-sanitize', async () => {
      const initialMail = createMockMail({
        payload: '<p>Initial content</p>',
      });

      const { rerender } = render(<MailDisplay mail={initialMail} />);

      await waitFor(() => {
        expect(vi.mocked(DOMPurify.sanitize)).toHaveBeenCalledWith(
          '<p>Initial content</p>'
        );
      });

      // Clear the mock calls
      vi.mocked(DOMPurify.sanitize).mockClear();

      // Update with new content
      const updatedMail = createMockMail({
        payload: '<p>Updated content</p>',
      });

      rerender(<MailDisplay mail={updatedMail} />);

      await waitFor(() => {
        expect(vi.mocked(DOMPurify.sanitize)).toHaveBeenCalledWith(
          '<p>Updated content</p>'
        );
      });
    });
  });
});
