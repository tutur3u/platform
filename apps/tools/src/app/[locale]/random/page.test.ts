import { describe, expect, it, vi } from 'vitest';

vi.mock('next-intl/server', () => ({
  getTranslations: async () => (key: string) => {
    const translations: Record<string, string> = {
      'meta.description': 'Generate secure random values in your browser.',
      'meta.title': 'Secure Random Generator',
    };

    return translations[key] ?? key;
  },
}));

vi.mock('./random-generator-client', () => ({
  default: function RandomGeneratorClientMock() {
    return null;
  },
}));

describe('random generator page', () => {
  it('returns localized metadata', async () => {
    const { generateMetadata } = await import('./page');

    await expect(
      generateMetadata({
        params: Promise.resolve({ locale: 'en' }),
      })
    ).resolves.toEqual({
      description: 'Generate secure random values in your browser.',
      title: 'Secure Random Generator',
    });
  });
});
