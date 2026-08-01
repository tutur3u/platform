import { describe, expect, it } from 'vitest';
import { LAUNCHABLE_APPS } from './launchable-apps';
import {
  ONBOARDING_MISSIONS,
  ONBOARDING_PERSONAS,
  recommendOnboardingApps,
} from './onboarding';

describe('connected onboarding manifest', () => {
  it('has one dedicated mission for every launchable app', () => {
    expect(ONBOARDING_MISSIONS.map(({ appSlug }) => appSlug).sort()).toEqual(
      LAUNCHABLE_APPS.map(({ slug }) => slug).sort()
    );
  });

  it('keeps every mission short and action-oriented', () => {
    expect(
      ONBOARDING_MISSIONS.every(({ capabilities }) => capabilities.length === 3)
    ).toBe(true);
  });

  it.each(ONBOARDING_PERSONAS)(
    'returns launchable recommendations for %s',
    (persona) => {
      const recommendations = recommendOnboardingApps({
        goals: [],
        persona,
      });
      const launchable = new Set(LAUNCHABLE_APPS.map(({ slug }) => slug));

      expect(recommendations.length).toBeGreaterThan(0);
      expect(recommendations.every((slug) => launchable.has(slug))).toBe(true);
    }
  );
});
