import { extractIPFromRequest } from '@tuturuuu/utils/abuse-protection/edge';

const buckets = new Map<string, { count: number; until: number }>();

export function allowPublicAssetTransform(headers: Headers) {
  const ip = extractIPFromRequest(headers);
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (bucket && bucket.until > now) {
    if (bucket.count >= 60) return false;
    bucket.count++;
    return true;
  }
  for (const [key, candidate] of buckets) {
    if (candidate.until <= now) buckets.delete(key);
  }
  // Evict the oldest window so a burst of new addresses cannot lock out others.
  const oldest = buckets.size >= 4_096 ? buckets.keys().next().value : null;
  if (oldest != null) buckets.delete(oldest);
  buckets.set(ip, { count: 1, until: now + 60_000 });
  return true;
}
