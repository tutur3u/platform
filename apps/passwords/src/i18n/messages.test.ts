import { describe, expect, it } from 'vitest';
import en from '../../messages/en.json';
import vi from '../../messages/vi.json';
import { AUDIT_EVENT_TYPES } from '../service/port';
import { createTranslator } from './messages';

function flat(node: unknown, prefix = ''): Record<string, string> {
  return Object.fromEntries(
    Object.entries(node as Record<string, unknown>).flatMap(([key, value]) =>
      typeof value === 'string'
        ? [[`${prefix}${key}`, value]]
        : Object.entries(flat(value, `${prefix}${key}.`))
    )
  );
}

const placeholders = (text: string) => text.match(/\{\w+\}/gu)?.sort() ?? [];

describe('messages', () => {
  it('resolves every SQL audit event through the public translator', () => {
    for (const locale of ['en', 'vi'] as const)
      for (const event of AUDIT_EVENT_TYPES) {
        const key = `audit.type.${event}` as const;
        expect(createTranslator(locale)(key)).not.toBe(key);
      }
  });
  it('ships the same keys in English and Vietnamese', () => {
    expect(Object.keys(flat(vi)).sort()).toEqual(Object.keys(flat(en)).sort());
  });

  it('keeps the same interpolation placeholders in both locales', () => {
    const english = flat(en);
    const vietnamese = flat(vi);
    for (const key of Object.keys(english))
      expect(placeholders(vietnamese[key] ?? '')).toEqual(
        placeholders(english[key] ?? '')
      );
  });

  it('interpolates parameters', () => {
    expect(createTranslator('en')('reveal.hidesIn', { seconds: 42 })).toBe(
      'Hides in 42 s'
    );
  });
});
