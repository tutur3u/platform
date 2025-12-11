/**
 * Email Service Security
 *
 * Security utilities for email handling including:
 * - Content hashing for deduplication
 * - Credential caching and validation
 * - Sensitive data masking
 * - Domain verification helpers
 */

import { createHash } from 'crypto';

// =============================================================================
// Content Hashing
// =============================================================================

/**
 * Generate a SHA-256 hash of email content for deduplication.
 * Useful for detecting and preventing duplicate emails.
 */
export function hashEmailContent(
  to: string[],
  subject: string,
  html: string
): string {
  const content = [
    to.sort().join(',').toLowerCase(),
    subject.trim(),
    html,
  ].join('|');

  return createHash('sha256').update(content).digest('hex');
}

/**
 * Generate a short content fingerprint for logging.
 */
export function contentFingerprint(
  to: string[],
  subject: string,
  html: string
): string {
  return hashEmailContent(to, subject, html).substring(0, 12);
}

// =============================================================================
// Credential Security
// =============================================================================

/**
 * Mask sensitive credential data for logging.
 */
export function maskCredential(value: string, visibleChars = 4): string {
  if (value.length <= visibleChars * 2) {
    return '*'.repeat(value.length);
  }
  const start = value.substring(0, visibleChars);
  const end = value.substring(value.length - visibleChars);
  const masked = '*'.repeat(Math.min(value.length - visibleChars * 2, 8));
  return `${start}${masked}${end}`;
}

/**
 * Mask email address for logging (preserves domain).
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;

  const maskedLocal =
    local.length <= 2
      ? '*'.repeat(local.length)
      : local[0] + '*'.repeat(local.length - 2) + local[local.length - 1];

  return `${maskedLocal}@${domain}`;
}

/**
 * Mask multiple email addresses.
 */
export function maskEmails(emails: string[]): string[] {
  return emails.map(maskEmail);
}

// =============================================================================
// Credential Cache (In-Memory with TTL)
// =============================================================================

interface CachedCredential<T> {
  data: T;
  expiresAt: number;
}

const credentialCache = new Map<string, CachedCredential<unknown>>();
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get or set a cached value with TTL.
 */
export async function getCachedCredential<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = DEFAULT_CACHE_TTL_MS
): Promise<T> {
  const now = Date.now();
  const cached = credentialCache.get(key) as CachedCredential<T> | undefined;

  if (cached && now < cached.expiresAt) {
    return cached.data;
  }

  const data = await fetcher();
  credentialCache.set(key, { data, expiresAt: now + ttlMs });

  return data;
}

/**
 * Invalidate a cached credential.
 */
export function invalidateCachedCredential(key: string): boolean {
  return credentialCache.delete(key);
}

/**
 * Clear all cached credentials.
 */
export function clearCredentialCache(): void {
  credentialCache.clear();
}

/**
 * Get cache key for workspace credentials.
 */
export function getWorkspaceCredentialKey(wsId: string): string {
  return `ws-cred:${wsId}`;
}

// Clean up expired entries periodically
setInterval(
  () => {
    const now = Date.now();
    for (const [key, value] of credentialCache.entries()) {
      if (now >= value.expiresAt) {
        credentialCache.delete(key);
      }
    }
  },
  60 * 1000 // Every minute
);

// =============================================================================
// Domain Security
// =============================================================================

/**
 * Extract domain from email address.
 */
export function extractDomain(email: string): string | null {
  const match = email.match(/@([a-zA-Z0-9.-]+)$/);
  return match ? (match[1]?.toLowerCase() ?? null) : null;
}

/**
 * Check if domain is a known disposable email provider.
 * This is a basic list; consider using a dedicated service for production.
 */
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com',
  'guerrillamail.com',
  'tempmail.com',
  'throwaway.email',
  '10minutemail.com',
  'trashmail.com',
  'fakeinbox.com',
  'getnada.com',
  'maildrop.cc',
  'dispostable.com',
]);

export function isDisposableDomain(email: string): boolean {
  const domain = extractDomain(email);
  return domain ? DISPOSABLE_DOMAINS.has(domain) : false;
}

/**
 * Check if email domain matches sender domain.
 * Useful for detecting potential spoofing.
 */
export function domainMatches(
  recipientEmail: string,
  senderEmail: string
): boolean {
  const recipientDomain = extractDomain(recipientEmail);
  const senderDomain = extractDomain(senderEmail);
  return (
    recipientDomain !== null &&
    senderDomain !== null &&
    recipientDomain === senderDomain
  );
}

// =============================================================================
// Content Security
// =============================================================================

/**
 * Check if HTML content contains potentially dangerous patterns.
 * Note: This is a basic check; proper sanitization should use DOMPurify.
 */
export function containsSuspiciousContent(html: string): {
  suspicious: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  // Check for javascript: URLs
  if (/javascript:/i.test(html)) {
    reasons.push('Contains javascript: URL');
  }

  // Check for data: URLs with script content
  if (/data:[^;]*;base64.*script/i.test(html)) {
    reasons.push('Contains suspicious data: URL');
  }

  // Check for event handlers
  if (/on\w+\s*=/i.test(html)) {
    reasons.push('Contains inline event handlers');
  }

  // Check for external form actions
  if (/<form[^>]*action\s*=\s*["']?https?:\/\//i.test(html)) {
    reasons.push('Contains external form action');
  }

  // Check for hidden iframes
  if (/<iframe[^>]*style[^>]*display\s*:\s*none/i.test(html)) {
    reasons.push('Contains hidden iframe');
  }

  return {
    suspicious: reasons.length > 0,
    reasons,
  };
}

/**
 * Estimate the "spamminess" of email content.
 * Returns a score from 0-100 (higher = more likely spam).
 */
export function spamScore(subject: string, html: string): number {
  let score = 0;

  // Subject checks
  if (/FREE|WIN|WINNER|PRIZE|CASH|MONEY/i.test(subject)) score += 15;
  if (/URGENT|ACT NOW|LIMITED TIME|EXPIRES/i.test(subject)) score += 10;
  if (subject === subject.toUpperCase() && subject.length > 10) score += 10;
  if (/!{2,}|\${2,}/g.test(subject)) score += 10;

  // Content checks
  const textContent = html.replace(/<[^>]+>/g, ' ');
  if (/click here|unsubscribe/i.test(textContent)) score += 5;
  if (/viagra|cialis|pharmacy/i.test(textContent)) score += 30;
  if (/nigerian prince|inheritance|lottery/i.test(textContent)) score += 40;

  // Link density
  const linkCount = (html.match(/<a\s/gi) || []).length;
  const wordCount = textContent.split(/\s+/).length;
  if (wordCount > 0 && linkCount / wordCount > 0.1) score += 15;

  // Image-heavy email
  const imgCount = (html.match(/<img\s/gi) || []).length;
  if (imgCount > 5 && wordCount < 50) score += 20;

  return Math.min(100, score);
}

// =============================================================================
// Rate Limit Key Security
// =============================================================================

/**
 * Hash IP address for privacy-safe rate limiting.
 */
export function hashIpAddress(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').substring(0, 16);
}

/**
 * Hash user ID for privacy-safe rate limiting.
 */
export function hashUserId(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').substring(0, 16);
}
