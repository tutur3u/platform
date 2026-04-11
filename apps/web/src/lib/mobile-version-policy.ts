import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';

export const MOBILE_VERSION_POLICY_CONFIG_KEYS = {
  ios: {
    effectiveVersion: 'MOBILE_IOS_EFFECTIVE_VERSION',
    minimumVersion: 'MOBILE_IOS_MINIMUM_VERSION',
    otpEnabled: 'MOBILE_IOS_OTP_ENABLED',
    storeUrl: 'MOBILE_IOS_STORE_URL',
  },
  android: {
    effectiveVersion: 'MOBILE_ANDROID_EFFECTIVE_VERSION',
    minimumVersion: 'MOBILE_ANDROID_MINIMUM_VERSION',
    otpEnabled: 'MOBILE_ANDROID_OTP_ENABLED',
    storeUrl: 'MOBILE_ANDROID_STORE_URL',
  },
} as const;

export const WEB_OTP_ENABLED_CONFIG_KEY = 'WEB_OTP_ENABLED';

export type MobilePlatform = keyof typeof MOBILE_VERSION_POLICY_CONFIG_KEYS;
export type MobileVersionStatus =
  | 'supported'
  | 'update-recommended'
  | 'update-required';

export interface MobilePlatformVersionPolicy {
  effectiveVersion: string | null;
  minimumVersion: string | null;
  otpEnabled: boolean;
  storeUrl: string | null;
}

export interface MobileVersionPolicies {
  ios: MobilePlatformVersionPolicy;
  android: MobilePlatformVersionPolicy;
  webOtpEnabled: boolean;
}

export interface MobileVersionCheckResult {
  platform: MobilePlatform;
  currentVersion: string;
  effectiveVersion: string | null;
  minimumVersion: string | null;
  otpEnabled: boolean;
  storeUrl: string | null;
  status: MobileVersionStatus;
  shouldUpdate: boolean;
  requiresUpdate: boolean;
}

const STRICT_SEMVER_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export function normalizeOptionalString(value: unknown) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function normalizeBooleanValue(value: unknown) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'string') {
    switch (value.trim().toLowerCase()) {
      case '1':
      case 'on':
      case 'true':
      case 'yes':
        return true;
      default:
        return false;
    }
  }

  return false;
}

export function isStrictSemver(value: string) {
  return STRICT_SEMVER_REGEX.test(value);
}

function parseStrictSemver(value: string) {
  if (!isStrictSemver(value)) {
    throw new Error(`Invalid semantic version: ${value}`);
  }

  const [major, minor, patch] = value
    .split('.')
    .map((part) => Number(part)) as [number, number, number];

  return [major, minor, patch] as const;
}

export function compareStrictSemver(left: string, right: string) {
  const [leftMajor, leftMinor, leftPatch] = parseStrictSemver(left);
  const [rightMajor, rightMinor, rightPatch] = parseStrictSemver(right);

  if (leftMajor !== rightMajor) return leftMajor - rightMajor;
  if (leftMinor !== rightMinor) return leftMinor - rightMinor;
  return leftPatch - rightPatch;
}

export function normalizeMobileVersionPolicies(
  value: Partial<
    Record<
      MobilePlatform,
      Partial<Record<keyof MobilePlatformVersionPolicy, unknown>> | undefined
    >
  > & { webOtpEnabled?: unknown }
): MobileVersionPolicies {
  return {
    ios: {
      effectiveVersion: normalizeOptionalString(value.ios?.effectiveVersion),
      minimumVersion: normalizeOptionalString(value.ios?.minimumVersion),
      otpEnabled: normalizeBooleanValue(value.ios?.otpEnabled),
      storeUrl: normalizeOptionalString(value.ios?.storeUrl),
    },
    android: {
      effectiveVersion: normalizeOptionalString(
        value.android?.effectiveVersion
      ),
      minimumVersion: normalizeOptionalString(value.android?.minimumVersion),
      otpEnabled: normalizeBooleanValue(value.android?.otpEnabled),
      storeUrl: normalizeOptionalString(value.android?.storeUrl),
    },
    webOtpEnabled: normalizeBooleanValue(value.webOtpEnabled),
  };
}

export function validateMobileVersionPolicies(value: MobileVersionPolicies) {
  const errors: string[] = [];

  for (const platform of Object.keys(
    MOBILE_VERSION_POLICY_CONFIG_KEYS
  ) as MobilePlatform[]) {
    const policy = value[platform];
    const hasThreshold =
      policy.effectiveVersion !== null || policy.minimumVersion !== null;

    if (
      policy.effectiveVersion !== null &&
      !isStrictSemver(policy.effectiveVersion)
    ) {
      errors.push(`${platform}: effective version must use x.y.z format`);
    }

    if (
      policy.minimumVersion !== null &&
      !isStrictSemver(policy.minimumVersion)
    ) {
      errors.push(`${platform}: minimum version must use x.y.z format`);
    }

    if (
      policy.effectiveVersion !== null &&
      policy.minimumVersion !== null &&
      compareStrictSemver(policy.effectiveVersion, policy.minimumVersion) < 0
    ) {
      errors.push(
        `${platform}: effective version must be greater than or equal to minimum version`
      );
    }

    if (hasThreshold && policy.storeUrl === null) {
      errors.push(`${platform}: store URL is required when a version is set`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export async function getMobileVersionPolicies() {
  const sbAdmin = await createAdminClient();
  const configIds: string[] = Object.values(
    MOBILE_VERSION_POLICY_CONFIG_KEYS
  ).flatMap((platformConfig) => Object.values(platformConfig));
  configIds.push(WEB_OTP_ENABLED_CONFIG_KEY);

  const { data, error } = await sbAdmin
    .from('workspace_configs')
    .select('id, value')
    .eq('ws_id', ROOT_WORKSPACE_ID)
    .in('id', configIds);

  if (error) {
    throw new Error('Failed to fetch mobile version policies');
  }

  const configMap = new Map(data.map((item) => [item.id, item.value]));
  const policies = normalizeMobileVersionPolicies({
    ios: {
      effectiveVersion: configMap.get(
        MOBILE_VERSION_POLICY_CONFIG_KEYS.ios.effectiveVersion
      ),
      minimumVersion: configMap.get(
        MOBILE_VERSION_POLICY_CONFIG_KEYS.ios.minimumVersion
      ),
      otpEnabled: configMap.get(
        MOBILE_VERSION_POLICY_CONFIG_KEYS.ios.otpEnabled
      ),
      storeUrl: configMap.get(MOBILE_VERSION_POLICY_CONFIG_KEYS.ios.storeUrl),
    },
    android: {
      effectiveVersion: configMap.get(
        MOBILE_VERSION_POLICY_CONFIG_KEYS.android.effectiveVersion
      ),
      minimumVersion: configMap.get(
        MOBILE_VERSION_POLICY_CONFIG_KEYS.android.minimumVersion
      ),
      otpEnabled: configMap.get(
        MOBILE_VERSION_POLICY_CONFIG_KEYS.android.otpEnabled
      ),
      storeUrl: configMap.get(
        MOBILE_VERSION_POLICY_CONFIG_KEYS.android.storeUrl
      ),
    },
    webOtpEnabled: configMap.get(WEB_OTP_ENABLED_CONFIG_KEY),
  });

  const validation = validateMobileVersionPolicies(policies);
  if (!validation.valid) {
    throw new Error(validation.errors.join('; '));
  }

  return policies;
}

export function evaluateMobileVersionPolicy({
  currentVersion,
  platform,
  policies,
}: {
  currentVersion: string;
  platform: MobilePlatform;
  policies: MobileVersionPolicies;
}): MobileVersionCheckResult {
  if (!isStrictSemver(currentVersion)) {
    throw new Error('Current version must use x.y.z format');
  }

  const policy = policies[platform];

  let status: MobileVersionStatus = 'supported';
  if (
    policy.minimumVersion !== null &&
    compareStrictSemver(currentVersion, policy.minimumVersion) < 0
  ) {
    status = 'update-required';
  } else if (
    policy.effectiveVersion !== null &&
    compareStrictSemver(currentVersion, policy.effectiveVersion) < 0
  ) {
    status = 'update-recommended';
  }

  return {
    platform,
    currentVersion,
    effectiveVersion: policy.effectiveVersion,
    minimumVersion: policy.minimumVersion,
    otpEnabled: policy.otpEnabled,
    storeUrl: policy.storeUrl,
    status,
    shouldUpdate: status !== 'supported',
    requiresUpdate: status === 'update-required',
  };
}
