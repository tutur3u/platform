import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const requiredSharedMessages = [
  'common.hidden',
  'settings.back_to_app',
  'settings.search_settings_placeholder',
] as const;

function readMessages(locale: 'en' | 'vi') {
  return JSON.parse(
    readFileSync(new URL(`../messages/${locale}.json`, import.meta.url), 'utf8')
  ) as Record<string, unknown>;
}

function getMessage(messages: Record<string, unknown>, path: string) {
  return path.split('.').reduce<unknown>((value, segment) => {
    if (!value || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[segment];
  }, messages);
}

describe('Mail shared component message contract', () => {
  for (const locale of ['en', 'vi'] as const) {
    it(`provides shared settings and user navigation messages in ${locale}`, () => {
      const messages = readMessages(locale);
      for (const path of requiredSharedMessages) {
        expect(getMessage(messages, path), `${locale}:${path}`).toBeTypeOf(
          'string'
        );
      }
    });
  }
});
