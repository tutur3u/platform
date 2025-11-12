/**
 * Simple HTML sanitizer for event descriptions
 * Allows only safe tags and attributes to prevent XSS attacks
 */

// Allowed HTML tags for event descriptions
const ALLOWED_TAGS = [
  'p',
  'br',
  'strong',
  'b',
  'em',
  'i',
  'u',
  'a',
  'ul',
  'ol',
  'li',
  'span',
  'div',
];

// Allowed attributes for each tag
const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  a: ['href', 'title', 'target', 'rel'],
  span: ['class'],
  div: ['class'],
};

// URL protocols that are safe
const SAFE_URL_PROTOCOLS = ['http:', 'https:', 'mailto:'];

/**
 * Sanitize a URL to prevent javascript: and data: URLs
 */
function sanitizeUrl(url: string): string | null {
  try {
    const trimmed = url.trim();

    // Allow relative URLs
    if (
      trimmed.startsWith('/') ||
      trimmed.startsWith('./') ||
      trimmed.startsWith('../')
    ) {
      return trimmed;
    }

    // Check protocol for absolute URLs
    const urlObj = new URL(trimmed, window.location.origin);
    if (SAFE_URL_PROTOCOLS.includes(urlObj.protocol)) {
      return trimmed;
    }

    return null;
  } catch {
    // If URL parsing fails, it's probably not a valid URL
    return null;
  }
}

/**
 * Sanitize HTML content by stripping dangerous tags and attributes
 * This is a simple implementation - for production, consider using DOMPurify
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';

  // Create a temporary DOM element to parse HTML
  const temp = document.createElement('div');
  temp.innerHTML = html;

  // Recursive function to sanitize nodes
  function sanitizeNode(node: Node): Node | null {
    // Text nodes are always safe
    if (node.nodeType === Node.TEXT_NODE) {
      return node.cloneNode(true);
    }

    // Only process element nodes
    if (node.nodeType !== Node.ELEMENT_NODE) {
      return null;
    }

    const element = node as Element;
    const tagName = element.tagName.toLowerCase();

    // Check if tag is allowed
    if (!ALLOWED_TAGS.includes(tagName)) {
      // For disallowed tags, keep their text content but not the tag itself
      const textContent = element.textContent || '';
      return document.createTextNode(textContent);
    }

    // Create a new element with the same tag
    const newElement = document.createElement(tagName);

    // Copy allowed attributes
    const allowedAttrs = ALLOWED_ATTRIBUTES[tagName] || [];
    for (const attr of allowedAttrs) {
      const value = element.getAttribute(attr);
      if (value) {
        // Special handling for URLs in href
        if (attr === 'href') {
          const sanitizedUrl = sanitizeUrl(value);
          if (sanitizedUrl) {
            newElement.setAttribute(attr, sanitizedUrl);
            // Add rel="noopener noreferrer" for external links for security
            if (sanitizedUrl.startsWith('http')) {
              newElement.setAttribute('rel', 'noopener noreferrer');
              newElement.setAttribute('target', '_blank');
            }
          }
        } else {
          newElement.setAttribute(attr, value);
        }
      }
    }

    // Recursively sanitize child nodes
    for (const child of Array.from(element.childNodes)) {
      const sanitizedChild = sanitizeNode(child);
      if (sanitizedChild) {
        newElement.appendChild(sanitizedChild);
      }
    }

    return newElement;
  }

  // Sanitize all child nodes
  const sanitizedDiv = document.createElement('div');
  for (const child of Array.from(temp.childNodes)) {
    const sanitizedChild = sanitizeNode(child);
    if (sanitizedChild) {
      sanitizedDiv.appendChild(sanitizedChild);
    }
  }

  return sanitizedDiv.innerHTML;
}

/**
 * Convert plain text to HTML, preserving line breaks
 */
export function textToHtml(text: string): string {
  return text.replace(/\n/g, '<br>');
}

/**
 * Check if a string contains HTML tags
 */
export function containsHtml(str: string): boolean {
  return /<[^>]+>/g.test(str);
}
