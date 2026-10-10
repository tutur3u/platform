import { type AbstractIntlMessages, createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import vi from '../../../messages/vi.json';

// Runtime type interpolation is invisible to the static source-key scanner.
// Checking both owning bundles catches a key missing from BOTH locales.
describe('incoming Mail notification type labels', () => {
  it.each([
    ['en', en, 'Mail received'],
    ['vi', vi, 'Nhận được thư'],
  ] as const)(
    'renders the dynamic type label in %s',
    (locale, messages, expected) => {
      const errors: unknown[] = [];
      const t = createTranslator({
        locale,
        messages: {
          notifications: messages.notifications,
        } as AbstractIntlMessages,
        namespace: 'notifications',
        onError: (error) => errors.push(error),
      });
      const type: string = 'mail_received';
      expect(t(`types.${type}`)).toBe(expected);
      expect(errors).toEqual([]);
    }
  );
});
