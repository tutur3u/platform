import {
  type FleetGrantCapability,
  type FleetGrantInput,
  type FleetGrantTier,
  type FleetOwnerGrant,
  fleetGrantInputSchema,
  fleetTierCeiling,
} from '@tuturuuu/internal-api/fleet';
import type { Tone } from '../components/tone';
import { FLEET_TIME_ZONE } from '../i18n';

export type GrantDraft = {
  email: string;
  tier: FleetGrantTier;
  capabilities: FleetGrantCapability[];
  projectKeys: string[];
  /** A `YYYY-MM-DD` day in the fleet's zone, or empty for no expiry. */
  expiresOn: string;
  questionsPerHour: string;
  intentsPerDay: string;
  modelBudgetPerMonth: string;
  /** Null files a new grant; an edit carries the generation it read. */
  expectedGeneration: string | null;
};

export type GrantField =
  | 'email'
  | 'capabilities'
  | 'projectKeys'
  | 'expiresOn'
  | 'questionsPerHour'
  | 'intentsPerDay'
  | 'modelBudgetPerMonth';
export type GrantErrors = Partial<Record<GrantField, 'required' | 'invalid'>>;

/** Each tier starts from its full ceiling; the Owner can narrow it. */
export function tierPreset(tier: FleetGrantTier): FleetGrantCapability[] {
  return [...fleetTierCeiling[tier]];
}

export function emptyGrantDraft(): GrantDraft {
  return {
    email: '',
    tier: 'observer',
    capabilities: tierPreset('observer'),
    projectKeys: [],
    expiresOn: '',
    questionsPerHour: '30',
    intentsPerDay: '10',
    modelBudgetPerMonth: '0',
    expectedGeneration: null,
  };
}

export function grantDraftOf(grant: FleetOwnerGrant): GrantDraft {
  return {
    email: grant.email ?? '',
    tier: grant.tier,
    capabilities: grant.capabilities.filter((value) =>
      fleetTierCeiling[grant.tier].includes(value)
    ),
    projectKeys: grant.projects,
    expiresOn: grant.expiresAt ? fleetDay(grant.expiresAt) : '',
    questionsPerHour: String(grant.questionsPerHour),
    intentsPerDay: String(grant.intentsPerDay),
    modelBudgetPerMonth: String(grant.modelBudgetPerMonth),
    // A revoked or expired grant is granted again from scratch.
    expectedGeneration: grant.status === 'active' ? grant.generation : null,
  };
}

/** A tier change resets capabilities to the new tier's preset. */
export function editGrantDraft(
  draft: GrantDraft,
  patch: Partial<GrantDraft>
): GrantDraft {
  if (patch.tier && patch.tier !== draft.tier) {
    return { ...draft, ...patch, capabilities: tierPreset(patch.tier) };
  }
  return { ...draft, ...patch };
}

export function toggle<T>(values: readonly T[], value: T, on: boolean): T[] {
  return on
    ? [...values.filter((entry) => entry !== value), value]
    : values.filter((entry) => entry !== value);
}

/** Asia/Ho_Chi_Minh has no daylight saving, so its offset is fixed. */
const FLEET_OFFSET = '+07:00';

/** Access ends at the close of the chosen day in the fleet's zone. */
export function expiryOf(day: string) {
  return new Date(`${day}T23:59:59.999${FLEET_OFFSET}`).toISOString();
}

export function fleetDay(iso: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: FLEET_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

const count = (value: string) =>
  /^\d{1,10}$/.test(value.trim()) ? Number(value.trim()) : Number.NaN;

/** Builds the wire shape; `fleetGrantInputSchema` validates it. */
export function grantInputOf(draft: GrantDraft): unknown {
  const day = draft.expiresOn.trim();
  return {
    email: draft.email.trim(),
    tier: draft.tier,
    capabilities: draft.capabilities,
    projectKeys: draft.projectKeys,
    expiresAt: day ? expiryOf(day) : null,
    questionsPerHour: count(draft.questionsPerHour),
    intentsPerDay: count(draft.intentsPerDay),
    modelBudgetPerMonth: count(draft.modelBudgetPerMonth),
    expectedGeneration: draft.expectedGeneration,
  };
}

const fieldOf: Record<string, GrantField> = {
  email: 'email',
  capabilities: 'capabilities',
  projectKeys: 'projectKeys',
  expiresAt: 'expiresOn',
  questionsPerHour: 'questionsPerHour',
  intentsPerDay: 'intentsPerDay',
  modelBudgetPerMonth: 'modelBudgetPerMonth',
};

/** The validated grant, or the fields people can correct. */
export function checkGrant(
  draft: GrantDraft,
  now = Date.now()
): { input: FleetGrantInput } | { errors: GrantErrors } {
  const errors: GrantErrors = {};
  const day = draft.expiresOn.trim();
  if (day && !(Date.parse(expiryOf(day)) > now)) errors.expiresOn = 'invalid';
  const result = fleetGrantInputSchema.safeParse(grantInputOf(draft));
  if (result.success && !errors.expiresOn) return { input: result.data };
  for (const issue of result.error?.issues ?? []) {
    const field = fieldOf[String(issue.path[0])];
    if (!field) continue;
    const empty =
      (field === 'email' && !draft.email.trim()) ||
      (field === 'projectKeys' && draft.projectKeys.length === 0) ||
      (field === 'capabilities' && draft.capabilities.length === 0);
    errors[field] = empty ? 'required' : 'invalid';
  }
  return { errors };
}

export const grantStatusTone: Record<FleetOwnerGrant['status'], Tone> = {
  active: 'green',
  expired: 'gray',
  revoked: 'red',
};
