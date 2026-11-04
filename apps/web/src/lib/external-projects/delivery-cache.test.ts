import { expect, it } from 'vitest';
import {
  CMS_DELIVERY_CACHE_CONTROL,
  CMS_DELIVERY_CDN_CACHE_CONTROL,
} from './delivery-cache';

it.each([CMS_DELIVERY_CACHE_CONTROL, CMS_DELIVERY_CDN_CACHE_CONTROL])(
  'bounds outage staleness to six minutes: %s',
  (policy) => {
    const sharedAge = /(?:s-maxage|max-age)=(\d+)/g;
    const ages = [...policy.matchAll(sharedAge)].map((match) =>
      Number(match[1])
    );
    const stale = Number(/stale-while-revalidate=(\d+)/.exec(policy)?.[1]);
    expect(ages.length).toBeGreaterThan(0);
    expect(Math.max(...ages)).toBeLessThanOrEqual(300);
    expect(stale).toBeLessThanOrEqual(60);
    expect(Math.max(...ages) + stale).toBeLessThanOrEqual(360);
    expect(policy).not.toContain('stale-if-error');
  }
);
