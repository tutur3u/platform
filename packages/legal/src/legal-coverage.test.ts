import { describe, expect, it } from 'vitest';
import {
  CONFIGURED_EXTERNAL_PROCESSORS,
  PUBLIC_APP_SERVICE_CATEGORY,
  PUBLIC_SERVICE_CATEGORIES,
} from './registry';
import { SUBPROCESSORS } from './subprocessors';

const registeredPublicApps = [
  'platform',
  'calendar',
  'chat',
  'cms',
  'drive',
  'apps',
  'docs',
  'finance',
  'hive',
  'inventory',
  'storefront',
  'learn',
  'mail',
  'meet',
  'mind',
  'ai',
  'nova',
  'tools',
  'rewise',
  'shortener',
  'tasks',
  'teach',
  'pay',
  'contacts',
  'forms',
  'track',
] as const;

describe('legal coverage', () => {
  it('maps every registered public app to a disclosed service category', () => {
    for (const app of registeredPublicApps) {
      const category = PUBLIC_APP_SERVICE_CATEGORY[app];
      expect(category).toBeDefined();
      expect(PUBLIC_SERVICE_CATEGORIES[category]).toBeTruthy();
    }
  });

  it('maps every configured processor to the subprocessor registry', () => {
    const registered = new Set(SUBPROCESSORS.map((provider) => provider.name));
    for (const processor of CONFIGURED_EXTERNAL_PROCESSORS) {
      expect(registered.has(processor)).toBe(true);
    }
  });
});
