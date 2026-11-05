import { describe, expect, it } from 'vitest';
import {
  getAppDomainByUrl,
  PRODUCTION_INTERNAL_APP_DOMAINS,
} from './internal-domains';
import {
  getLaunchableApp,
  getLaunchableAppByHostname,
  LAUNCHABLE_APPS,
} from './launchable-apps';
import { RETIRED_APP_HOSTNAMES } from './retired-app-hosts';
import { APP_SEO_POLICY } from './seo';

const REWISE_URL = 'https://rewise.tuturuuu.com';

describe('Rewise canonical URL', () => {
  it('is rewise.tuturuuu.com in every registry', () => {
    expect(
      PRODUCTION_INTERNAL_APP_DOMAINS.filter(
        (domain) => domain.name === 'rewise'
      ).map((domain) => domain.url)
    ).toEqual([REWISE_URL]);
    expect(getLaunchableApp('rewise')?.productionUrl).toBe(REWISE_URL);
    expect(APP_SEO_POLICY.rewise.origin).toBe(REWISE_URL);
  });

  it('maps the canonical host back to Rewise', () => {
    expect(getLaunchableAppByHostname('rewise.tuturuuu.com')?.slug).toBe(
      'rewise'
    );
    expect(getAppDomainByUrl(`${REWISE_URL}/verify-token`)?.name).toBe(
      'rewise'
    );
  });

  it.each(RETIRED_APP_HOSTNAMES)('never maps released %s to an app', (host) => {
    expect(getLaunchableAppByHostname(host)).toBeNull();
    expect(getAppDomainByUrl(`https://${host}`)).toBeNull();
  });

  it('keeps released domains out of every registry', () => {
    const registries = JSON.stringify([
      PRODUCTION_INTERNAL_APP_DOMAINS,
      LAUNCHABLE_APPS,
      APP_SEO_POLICY,
    ]);

    for (const host of RETIRED_APP_HOSTNAMES) {
      expect(registries).not.toContain(host);
    }
  });
});
