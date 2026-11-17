/**
 * Pure sender-block matching. A block is per mailbox and names either one
 * address or a domain; a domain block also covers its subdomains
 * (`sepay.vn` blocks `team@mail.sepay.vn`).
 */
export type SenderBlockKind = 'address' | 'domain';

export type SenderBlockRule = { kind: SenderBlockKind; value: string };

const ADDRESS = /^[^@\s]+@[^@\s]+\.[^@\s]+$/u;
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/u;

/** Public mailbox providers that must never be blocked as a whole domain. */
export const SHARED_PROVIDER_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.com.vn',
  'icloud.com',
  'me.com',
  'proton.me',
  'protonmail.com',
  'zoho.com',
  'aol.com',
  'gmx.com',
  'mail.com',
  'tuturuuu.com',
]);

/** Canonical rule value, or null when the input is not a valid rule. */
export function normalizeSenderBlock(
  kind: SenderBlockKind,
  raw: string
): SenderBlockRule | null {
  const value = raw.trim().toLowerCase().replace(/^@/u, '');
  if (value.length < 3 || value.length > 320) return null;
  if (kind === 'address') return ADDRESS.test(value) ? { kind, value } : null;
  if (!DOMAIN.test(value) || SHARED_PROVIDER_DOMAINS.has(value)) return null;
  return { kind, value };
}

export function senderDomain(address: string) {
  const at = address.lastIndexOf('@');
  return at === -1
    ? ''
    : address
        .slice(at + 1)
        .trim()
        .toLowerCase()
        // A fully qualified trailing dot names the same domain.
        .replace(/\.+$/u, '');
}

/** Escapes LIKE wildcards so a value matches only itself. */
export function exactLikePattern(value: string) {
  return value.replace(/[\\%_]/gu, (char) => `\\${char}`);
}

/**
 * Rule values that would block this sender: the address itself and every
 * parent domain with at least two labels.
 */
export function senderBlockCandidates(address: string | null | undefined) {
  const email = address?.trim().toLowerCase().replace(/\.+$/u, '') ?? '';
  if (!ADDRESS.test(email)) return [];
  const labels = senderDomain(email).split('.');
  const domains: SenderBlockRule[] = [];
  for (let start = 0; start <= labels.length - 2; start += 1) {
    domains.push({ kind: 'domain', value: labels.slice(start).join('.') });
  }
  return [{ kind: 'address' as const, value: email }, ...domains];
}

export function matchesSenderBlock(
  address: string | null | undefined,
  rules: readonly SenderBlockRule[]
) {
  const candidates = senderBlockCandidates(address);
  return rules.some((rule) =>
    candidates.some(
      (candidate) =>
        candidate.kind === rule.kind && candidate.value === rule.value
    )
  );
}
