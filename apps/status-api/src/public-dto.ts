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
  STATUS_OWNED_COMPONENT_IDS?: string;
};
export type Policy = NonNullable<ReturnType<typeof readPolicy>>;

const UTC_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?Z$/;
const ids = (list = '') => new Set(list.split(',').map((id) => id.trim()));

/** Missing lists fail closed; owned IDs come only from this trusted config. */
export function readPolicy(env: PolicyEnv) {
  const { STATUS_PUBLIC_COMPONENT_IDS: ok } = env;
  const { STATUS_CLIENT_CONSENT_IDS: consent, STATUS_NEVER_PUBLIC_IDS: no } =
    env;
  if (ok === undefined || consent === undefined || no === undefined)
    return null;
  const owned = ids(env.STATUS_OWNED_COMPONENT_IDS); // unset: owns nothing
  return { approved: ids(ok), owned, consented: ids(consent), never: ids(no) };
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
  const { id, status, updated_at } = raw as Record<string, unknown>;
  if (typeof id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(id)) return null;
  if (policy.never.has(id) || !policy.approved.has(id)) return null;
  if (!policy.owned.has(id) && !policy.consented.has(id)) return null;
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
