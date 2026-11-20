/**
 * Pure sender-block matching. A block is per mailbox and names either one
 * address or a domain; a domain block also covers its subdomains
 * (`sepay.vn` blocks `team@mail.sepay.vn`).
 */
export type SenderBlockKind = 'address' | 'domain';

export type SenderBlockRule = { kind: SenderBlockKind; value: string };

const MAX_RULE_LENGTH = 320;
const WHITESPACE = /\s/u;
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
  if (value.length < 3 || value.length > MAX_RULE_LENGTH) return null;
  if (kind === 'address') return isAddress(value) ? { kind, value } : null;
  if (!DOMAIN.test(value) || SHARED_PROVIDER_DOMAINS.has(value)) return null;
  return { kind, value };
}

/**
 * `local@domain.tld` shape: one `@`, no whitespace, and a dot inside the
 * domain. Checked by index scans rather than an ambiguous regex because the
 * value is a sender address chosen by whoever sends the mail.
 */
function isAddress(value: string) {
  if (WHITESPACE.test(value)) return false;
  const at = value.indexOf('@');
  if (at < 1 || value.includes('@', at + 1)) return false;
  const domain = value.slice(at + 1);
  const dot = domain.indexOf('.', 1);
  return dot !== -1 && dot < domain.length - 1;
}

/** Linear trailing-dot trim; a fully qualified trailing dot names the same domain. */
function trimTrailingDots(value: string) {
  let end = value.length;
  while (end > 0 && value[end - 1] === '.') end -= 1;
  return value.slice(0, end);
}

export function senderDomain(address: string) {
  const at = address.lastIndexOf('@');
  return at === -1
    ? ''
    : trimTrailingDots(
        address
          .slice(at + 1)
          .trim()
          .toLowerCase()
      );
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
  const email = trimTrailingDots(address?.trim().toLowerCase() ?? '');
  if (!isAddress(email)) return [];
  const domain = senderDomain(email);
  const lastDot = domain.lastIndexOf('.');
  const domains: SenderBlockRule[] = [];
  // A stored rule is at most MAX_RULE_LENGTH long, so longer suffixes can
  // never match; skipping them keeps hostile label runs linear.
  for (
    let start = Math.max(0, domain.length - MAX_RULE_LENGTH);
    start <= lastDot;
    start += 1
  ) {
    if (start === 0 || domain[start - 1] === '.') {
      domains.push({ kind: 'domain', value: domain.slice(start) });
    }
  }
  // An address longer than any stored rule cannot match one, and would only
  // bloat the lookup query that domain blocks depend on.
  return email.length > MAX_RULE_LENGTH
    ? domains
    : [{ kind: 'address' as const, value: email }, ...domains];
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
