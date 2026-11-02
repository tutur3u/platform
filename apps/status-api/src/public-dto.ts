// Public DTO boundary (DES-TTR-UPTIME v2 §6.2, §9.1): each record is a new
// object of exactly id, status, coarse updated_at; input is never spread.

// Ordered by severity; `unknown` (no current knowledge) ranks highest.
const STATES = [
  'operational',
  'under_maintenance',
  'degraded_performance',
  'partial_outage',
  'major_outage',
  'unknown',
] as const;
export type PublicState = (typeof STATES)[number];
export type PublicComponent = {
  id: string;
  status: PublicState;
  updated_at: string;
};
export type PublicEnvelope = {
  status: PublicState;
  components: PublicComponent[];
  generated_at: string | null;
  stale: boolean;
  fallback: boolean;
};
export type PolicyEnv = {
  STATUS_PUBLIC_COMPONENT_IDS?: string;
  STATUS_CLIENT_CONSENT_IDS?: string;
  STATUS_NEVER_PUBLIC_IDS?: string;
};
export type Policy = Record<'approved' | 'consented' | 'never', Set<string>>;

// Tiers publishable with approval alone. Any other or missing tier counts
// as client/partner and also needs recorded written consent.
const OWNED_TIERS = new Set(['primary', 'app', 'infrastructure']);
const UTC_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?Z$/;
const ids = (list: string) => new Set(list.split(',').map((id) => id.trim()));

/** Any missing policy binding fails closed: publish nothing. */
export function readPolicy(env: PolicyEnv): Policy | null {
  const { STATUS_PUBLIC_COMPONENT_IDS: approved } = env;
  const { STATUS_CLIENT_CONSENT_IDS: consent, STATUS_NEVER_PUBLIC_IDS: no } =
    env;
  if (approved === undefined || consent === undefined || no === undefined)
    return null;
  return { approved: ids(approved), consented: ids(consent), never: ids(no) };
}

/** Strict UTC timestamp rounded down to the minute, or null. */
export function coarseTime(value: unknown): number | null {
  if (typeof value !== 'string' || !UTC_TIME.test(value)) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms - (ms % 60_000) : null;
}

export const isoMinute = (ms: number) =>
  new Date(ms).toISOString().replace('.000Z', 'Z');

/** The allowlist constructor; null for anything not publishable. */
export function toPublicComponent(
  raw: unknown,
  policy: Policy,
  forceUnknown: boolean
): PublicComponent | null {
  if (!raw || typeof raw !== 'object') return null;
  const { id, tier, status, updated_at } = raw as Record<string, unknown>;
  if (typeof id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(id)) return null;
  if (policy.never.has(id) || !policy.approved.has(id)) return null;
  const owned = typeof tier === 'string' && OWNED_TIERS.has(tier);
  if (!owned && !policy.consented.has(id)) return null;
  const updated = coarseTime(updated_at);
  if (updated === null) return null;
  const known = STATES.find((state) => state === status) ?? 'unknown';
  const state = forceUnknown ? 'unknown' : known;
  return { id, status: state, updated_at: isoMinute(updated) };
}

/** Worst eligible state; an empty set never reads as operational. */
export const aggregateState = (records: PublicComponent[]): PublicState =>
  records.length === 0
    ? 'unknown'
    : STATES[Math.max(...records.map((r) => STATES.indexOf(r.status)))]!;
