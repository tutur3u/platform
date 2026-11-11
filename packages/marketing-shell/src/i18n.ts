import en from './messages/en.json' with { type: 'json' };
import vi from './messages/vi.json' with { type: 'json' };

export type MarketingLocale = 'en' | 'vi';
export const marketingMessages = { en, vi } as const;

/** Translator over the shell's own EN/VI strings (same keys as apps/marketing). */
export type Translate = (key: string) => string;

export function createTranslator(locale: MarketingLocale): Translate {
  const messages = marketingMessages[locale] ?? en;
  return (key) => {
    let node: unknown = messages;
    for (const part of key.split('.')) {
      if (!node || typeof node !== 'object') return key;
      node = (node as Record<string, unknown>)[part];
    }
    return typeof node === 'string' ? node : key;
  };
}
