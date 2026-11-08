import { describe, expect, it } from 'vitest';
import { AppSwitchTracker } from '@tuturuuu/satellite/app-switch-tracker';
import { cookieConsentBanner, evaluateFlags } from '@tuturuuu/feature-flags';
import { VercelAnalytics, VercelInsights } from '@tuturuuu/vercel';

describe('privacy delivery provider shutdown', () => {
  it('does not mount analytics SDKs or app-switch listeners', () => {
    expect(VercelAnalytics({})).toBeNull();
    expect(VercelInsights({})).toBeNull();
    expect(AppSwitchTracker({ currentApp: 'meet' })).toBeNull();
    expect(AppSwitchTracker({ currentApp: 'mail' })).toBeNull();
  });

  it('keeps the banner default off until explicitly enabled', () => {
    expect(evaluateFlags([cookieConsentBanner], {})).toEqual({
      cookie_consent_banner: false,
    });
    expect(
      evaluateFlags(
        [cookieConsentBanner],
        {},
        {
          cookie_consent_banner: true,
        }
      )
    ).toEqual({ cookie_consent_banner: true });
  });
});
