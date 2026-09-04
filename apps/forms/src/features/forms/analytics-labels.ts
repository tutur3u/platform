/**
 * Decodes a percent-encoded analytics label.
 *
 * Geo values arrive from request headers already URL-encoded, so a city
 * surfaces as `Hong%20Kong` and sorts and reads as though that were its name.
 *
 * Malformed input is returned untouched rather than thrown on: a label that
 * cannot be decoded is still a real bucket with real responses behind it, and
 * losing the row would be worse than showing an ugly one.
 */
export function decodeAnalyticsLabel(label: string): string {
  if (!label.includes('%')) return label;

  try {
    return decodeURIComponent(label);
  } catch {
    return label;
  }
}
