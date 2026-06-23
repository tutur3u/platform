import type { MobileVersionPoliciesPayload } from '@tuturuuu/internal-api/infrastructure/types';
import * as z from 'zod';

export const MOBILE_VERSION_PLATFORMS = ['ios', 'android'] as const;
export const VERSION_REGEX = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

export type MobileVersionPlatform = (typeof MOBILE_VERSION_PLATFORMS)[number];

export type MobileVersionFormValues = {
  android: {
    effectiveVersion: string;
    minimumVersion: string;
    otpEnabled: boolean;
    storeUrl: string;
  };
  ios: {
    effectiveVersion: string;
    minimumVersion: string;
    otpEnabled: boolean;
    storeUrl: string;
  };
  webOtpEnabled: boolean;
};

type ValidationTranslator = (
  key: 'validation.store_url_required' | 'validation.version_format'
) => string;

export function createMobileVersionFormSchema(t: ValidationTranslator) {
  const platformPolicySchema = z
    .object({
      effectiveVersion: z.string(),
      minimumVersion: z.string(),
      otpEnabled: z.boolean(),
      storeUrl: z.string(),
    })
    .superRefine((value, ctx) => {
      const effectiveVersion = value.effectiveVersion.trim();
      const minimumVersion = value.minimumVersion.trim();
      const storeUrl = value.storeUrl.trim();
      const hasThreshold =
        effectiveVersion.length > 0 || minimumVersion.length > 0;

      if (
        effectiveVersion.length > 0 &&
        !VERSION_REGEX.test(effectiveVersion)
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('validation.version_format'),
          path: ['effectiveVersion'],
        });
      }

      if (minimumVersion.length > 0 && !VERSION_REGEX.test(minimumVersion)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('validation.version_format'),
          path: ['minimumVersion'],
        });
      }

      if (hasThreshold && storeUrl.length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: t('validation.store_url_required'),
          path: ['storeUrl'],
        });
      }
    });

  return z.object({
    android: platformPolicySchema,
    ios: platformPolicySchema,
    webOtpEnabled: z.boolean(),
  });
}

export function toMobileVersionFormValues(
  data: MobileVersionPoliciesPayload
): MobileVersionFormValues {
  return {
    android: {
      effectiveVersion: data.android.effectiveVersion ?? '',
      minimumVersion: data.android.minimumVersion ?? '',
      otpEnabled: data.android.otpEnabled,
      storeUrl: data.android.storeUrl ?? '',
    },
    ios: {
      effectiveVersion: data.ios.effectiveVersion ?? '',
      minimumVersion: data.ios.minimumVersion ?? '',
      otpEnabled: data.ios.otpEnabled,
      storeUrl: data.ios.storeUrl ?? '',
    },
    webOtpEnabled: data.webOtpEnabled,
  };
}

export function toMobileVersionPoliciesPayload(
  values: MobileVersionFormValues
): MobileVersionPoliciesPayload {
  return {
    android: {
      effectiveVersion: values.android.effectiveVersion.trim() || null,
      minimumVersion: values.android.minimumVersion.trim() || null,
      otpEnabled: values.android.otpEnabled,
      storeUrl: values.android.storeUrl.trim() || null,
    },
    ios: {
      effectiveVersion: values.ios.effectiveVersion.trim() || null,
      minimumVersion: values.ios.minimumVersion.trim() || null,
      otpEnabled: values.ios.otpEnabled,
      storeUrl: values.ios.storeUrl.trim() || null,
    },
    webOtpEnabled: values.webOtpEnabled,
  };
}
