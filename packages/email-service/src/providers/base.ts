/**
 * Base Email Provider
 *
 * Abstract base class for email provider implementations.
 * Provides common functionality for HTML sanitization and source formatting.
 */

import type {
  EmailProvider,
  ProviderSendParams,
  ProviderSendResult,
} from '../types';

/**
 * Abstract base class for email providers.
 * Implement this class to add support for new email providers.
 */
export abstract class BaseEmailProvider implements EmailProvider {
  abstract name: string;

  abstract send(params: ProviderSendParams): Promise<ProviderSendResult>;

  abstract validateCredentials(): Promise<boolean>;

  /**
   * Format source email with display name.
   * @param name Display name
   * @param email Email address
   * @returns Formatted source string (e.g., "Display Name <email@domain.com>")
   */
  protected formatSource(name: string, email: string): string {
    // Escape special characters in name for RFC 5322 compliance
    const escapedName = name.replace(/[\\"]/g, '\\$&');
    return `"${escapedName}" <${email}>`;
  }

  /**
   * Sanitize HTML content to prevent XSS and ensure email compatibility.
   * Uses DOMPurify for sanitization and juice for CSS inlining.
   * @param html Raw HTML content
   * @returns Sanitized HTML with inlined CSS
   */
  protected async sanitizeHtml(html: string): Promise<string> {
    // Dynamic imports to avoid bundling issues
    const [{ default: DOMPurify }, { default: juice }] = await Promise.all([
      import('isomorphic-dompurify'),
      import('juice'),
    ]);

    // Sanitize HTML to remove potentially dangerous content
    const sanitized = DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true },
      ALLOWED_TAGS: [
        'a',
        'b',
        'blockquote',
        'br',
        'code',
        'div',
        'em',
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'hr',
        'i',
        'img',
        'li',
        'ol',
        'p',
        'pre',
        'span',
        'strong',
        'table',
        'tbody',
        'td',
        'th',
        'thead',
        'tr',
        'u',
        'ul',
        'style',
        'head',
        'body',
        'html',
      ],
      ALLOWED_ATTR: [
        'href',
        'src',
        'alt',
        'title',
        'style',
        'class',
        'id',
        'width',
        'height',
        'align',
        'valign',
        'bgcolor',
        'border',
        'cellpadding',
        'cellspacing',
      ],
    });

    // Inline CSS for better email client compatibility
    const inlined = juice(sanitized, {
      preserveMediaQueries: true,
      preserveFontFaces: true,
      preserveKeyFrames: true,
    });

    return inlined;
  }

  /**
   * Validate email addresses in recipients.
   * @param emails Array of email addresses
   * @returns True if all emails are valid
   */
  protected validateEmails(emails: string[]): boolean {
    const emailRegex =
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
    return emails.every((email) => emailRegex.test(email));
  }

  /**
   * Remove script and style blocks from HTML safely.
   * Uses a loop-based state machine to avoid ReDoS vulnerabilities
   * and properly handle malformed/nested tags.
   * @param html Raw HTML content
   * @returns HTML with script and style blocks removed
   */
  private removeScriptAndStyleBlocks(html: string): string {
    const result: string[] = [];
    let i = 0;
    const len = html.length;

    while (i < len) {
      // Check for opening <script or <style tags (case-insensitive)
      if (html[i] === '<' && i + 1 < len) {
        const remaining = html.slice(i, i + 8).toLowerCase();

        if (remaining.startsWith('<script') || remaining.startsWith('<style')) {
          const tagName = remaining.startsWith('<script') ? 'script' : 'style';
          const closeTag = `</${tagName}`;

          // Skip to end of opening tag
          while (i < len && html[i] !== '>') {
            i++;
          }
          i++; // Skip the '>'

          // Find and skip the closing tag (case-insensitive)
          while (i < len) {
            if (html[i] === '<') {
              const closeCheck = html
                .slice(i, i + closeTag.length + 1)
                .toLowerCase();
              if (closeCheck.startsWith(closeTag)) {
                // Skip past the closing tag
                while (i < len && html[i] !== '>') {
                  i++;
                }
                i++; // Skip the '>'
                break;
              }
            }
            i++;
          }
          continue;
        }
      }

      result.push(html[i]!);
      i++;
    }

    return result.join('');
  }

  /**
   * Generate plain text from HTML for multipart emails.
   * @param html HTML content
   * @returns Plain text version
   */
  protected htmlToPlainText(html: string): string {
    // Remove script and style blocks using safe loop-based approach
    // This avoids ReDoS vulnerabilities and properly handles malformed tags
    let text = this.removeScriptAndStyleBlocks(html);

    // Convert block elements to line breaks
    text = text
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<li>/gi, '- ')
      .replace(/<\/li>/gi, '\n');

    // Extract links with href (safe pattern - bounded character classes)
    text = text.replace(
      /<a[^>]{0,500}href="([^"]{0,2000})"[^>]{0,500}>([^<]{0,2000})<\/a>/gi,
      '$2 ($1)'
    );

    // Strip remaining HTML tags using safe non-regex approach
    // This avoids the vulnerable <[^>]+> regex pattern
    const parts: string[] = [];
    let inTag = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i]!; // Safe: i < text.length guarantees char exists
      if (char === '<') {
        inTag = true;
      } else if (char === '>') {
        inTag = false;
      } else if (!inTag) {
        parts.push(char);
      }
    }
    text = parts.join('');

    // Decode HTML entities in correct order
    // CRITICAL: &amp; must be decoded LAST to prevent double-decoding
    // (e.g., &amp;lt; should become &lt;, not <)
    const entityMap: Record<string, string> = {
      '&nbsp;': ' ',
      '&lt;': '<',
      '&gt;': '>',
      '&quot;': '"',
      '&#39;': "'",
      '&#x27;': "'",
      '&#x2F;': '/',
      '&apos;': "'",
    };

    // First pass: decode all entities EXCEPT &amp;
    for (const [entity, char] of Object.entries(entityMap)) {
      // Use split/join for safe multi-occurrence replacement
      text = text.split(entity).join(char);
    }

    // Second pass: decode &amp; LAST (prevents double-decoding issues)
    text = text.split('&amp;').join('&');

    // Normalize multiple newlines
    text = text.replace(/\n{3,}/g, '\n\n');

    return text.trim();
  }
}
