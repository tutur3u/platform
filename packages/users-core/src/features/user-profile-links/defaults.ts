import {
  WORKSPACE_USER_PROFILE_LINK_DEFAULT_EXPIRATION_CONFIG_ID,
  WORKSPACE_USER_PROFILE_LINK_DEFAULT_FIELDS_CONFIG_ID,
  WORKSPACE_USER_PROFILE_LINK_DEFAULT_MAX_USES_CONFIG_ID,
  WORKSPACE_USER_PROFILE_LINK_DEFAULT_PREFILL_EXISTING_VALUES_CONFIG_ID,
  WORKSPACE_USER_PROFILE_LINK_DEFAULT_REQUIRE_AUTH_CONFIG_ID,
} from '@tuturuuu/internal-api/workspace-configs';
import { isProfileLinkField, type ProfileLinkField } from './fields';

export const PROFILE_LINK_EXPIRATION_PRESETS = [
  '1d',
  '3d',
  '7d',
  '14d',
  '30d',
  'never',
] as const;

export type ProfileLinkExpirationPreset =
  (typeof PROFILE_LINK_EXPIRATION_PRESETS)[number];

export const PROFILE_LINK_DEFAULT_MAX_USES_UNLIMITED_VALUE = 'unlimited';

export function getProfileLinkDefaultsQueryKey(wsId: string) {
  return ['workspace-user-profile-link-defaults', wsId] as const;
}

export interface ProfileLinkDefaults {
  expirationPreset: ProfileLinkExpirationPreset;
  fields: ProfileLinkField[];
  maxUses: number | null;
  prefillExistingValues: boolean;
  requiresAuth: boolean;
}

export const DEFAULT_PROFILE_LINK_DEFAULTS: ProfileLinkDefaults = {
  expirationPreset: '30d',
  fields: ['display_name', 'full_name'],
  maxUses: 1,
  prefillExistingValues: true,
  requiresAuth: true,
};

const EXPIRATION_PRESET_DAYS: Record<
  Exclude<ProfileLinkExpirationPreset, 'never'>,
  number
> = {
  '1d': 1,
  '3d': 3,
  '7d': 7,
  '14d': 14,
  '30d': 30,
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function parseProfileLinkDefaultBoolean(
  value: string | null | undefined,
  fallback: boolean
) {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

export function parseProfileLinkDefaultExpirationPreset(
  value: string | null | undefined,
  fallback: ProfileLinkExpirationPreset = DEFAULT_PROFILE_LINK_DEFAULTS.expirationPreset
): ProfileLinkExpirationPreset {
  return PROFILE_LINK_EXPIRATION_PRESETS.includes(
    value as ProfileLinkExpirationPreset
  )
    ? (value as ProfileLinkExpirationPreset)
    : fallback;
}

export function parseProfileLinkDefaultFields(
  value: string | null | undefined,
  fallback: ProfileLinkField[] = DEFAULT_PROFILE_LINK_DEFAULTS.fields
) {
  const fields = (value ?? '')
    .split(',')
    .map((field) => field.trim())
    .filter(isProfileLinkField)
    .filter((field, index, values) => values.indexOf(field) === index);

  return fields.length > 0 ? fields : fallback;
}

export function parseProfileLinkDefaultMaxUses(
  value: string | null | undefined,
  fallback: number | null = DEFAULT_PROFILE_LINK_DEFAULTS.maxUses
) {
  if (value === PROFILE_LINK_DEFAULT_MAX_USES_UNLIMITED_VALUE) {
    return null;
  }

  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function serializeProfileLinkDefaultMaxUses(value: number | null) {
  return value === null
    ? PROFILE_LINK_DEFAULT_MAX_USES_UNLIMITED_VALUE
    : String(value);
}

export function resolveProfileLinkDefaults(
  configs: Record<string, string | null | undefined>
): ProfileLinkDefaults {
  return {
    expirationPreset: parseProfileLinkDefaultExpirationPreset(
      configs[WORKSPACE_USER_PROFILE_LINK_DEFAULT_EXPIRATION_CONFIG_ID]
    ),
    fields: parseProfileLinkDefaultFields(
      configs[WORKSPACE_USER_PROFILE_LINK_DEFAULT_FIELDS_CONFIG_ID]
    ),
    maxUses: parseProfileLinkDefaultMaxUses(
      configs[WORKSPACE_USER_PROFILE_LINK_DEFAULT_MAX_USES_CONFIG_ID]
    ),
    prefillExistingValues: parseProfileLinkDefaultBoolean(
      configs[
        WORKSPACE_USER_PROFILE_LINK_DEFAULT_PREFILL_EXISTING_VALUES_CONFIG_ID
      ],
      DEFAULT_PROFILE_LINK_DEFAULTS.prefillExistingValues
    ),
    requiresAuth: parseProfileLinkDefaultBoolean(
      configs[WORKSPACE_USER_PROFILE_LINK_DEFAULT_REQUIRE_AUTH_CONFIG_ID],
      DEFAULT_PROFILE_LINK_DEFAULTS.requiresAuth
    ),
  };
}

export function serializeProfileLinkDefaults(defaults: ProfileLinkDefaults) {
  return {
    [WORKSPACE_USER_PROFILE_LINK_DEFAULT_EXPIRATION_CONFIG_ID]:
      defaults.expirationPreset,
    [WORKSPACE_USER_PROFILE_LINK_DEFAULT_FIELDS_CONFIG_ID]:
      defaults.fields.join(','),
    [WORKSPACE_USER_PROFILE_LINK_DEFAULT_MAX_USES_CONFIG_ID]:
      serializeProfileLinkDefaultMaxUses(defaults.maxUses),
    [WORKSPACE_USER_PROFILE_LINK_DEFAULT_PREFILL_EXISTING_VALUES_CONFIG_ID]:
      String(defaults.prefillExistingValues),
    [WORKSPACE_USER_PROFILE_LINK_DEFAULT_REQUIRE_AUTH_CONFIG_ID]: String(
      defaults.requiresAuth
    ),
  };
}

export function resolveProfileLinkDefaultExpiresAt(
  preset: ProfileLinkExpirationPreset,
  now: Date = new Date()
) {
  if (preset === 'never') return null;

  return new Date(now.getTime() + EXPIRATION_PRESET_DAYS[preset] * DAY_MS);
}

export function formatDateTimeLocalInputValue(date: Date) {
  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return localDate.toISOString().slice(0, 16);
}
