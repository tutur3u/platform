import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';

// These shell components render on the private wiki before a project is created.
describe.each([
  ['en', en],
  ['vi', vi],
] as const)('Lettin %s shared shell messages', (locale, messages) => {
  it('resolves onboarding and settings labels without falling back to keys', () => {
    const errors: Error[] = [];
    const t = createTranslator({
      locale,
      messages,
      onError: (error) => errors.push(error),
    });
    for (const key of [
      'onboarding_guide.title',
      'onboarding_guide.description',
      'onboarding_guide.replay_app',
      'onboarding_guide.restart_journey',
      'settings.back_to_app',
      'settings.search_settings_placeholder',
    ] as const) {
      expect(t(key)).not.toBe(key);
      expect(t(key).trim()).not.toBe('');
    }
    expect(errors).toEqual([]);
  });
});
