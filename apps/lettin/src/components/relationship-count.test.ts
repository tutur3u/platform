import { createTranslator } from 'next-intl';
import { expect, it } from 'vitest';
import english from '../../messages/en.json';
import vietnamese from '../../messages/vi.json';

it('formats actual English target-count messages for zero, one and multiple targets', () => {
  const t = createTranslator({ locale: 'en', messages: english.lettin });
  expect(t('relationshipTargetCount', { count: 0 })).toBe(
    '0 available targets'
  );
  expect(t('relationshipTargetCount', { count: 1 })).toBe('1 available target');
  expect(t('relationshipTargetCount', { count: 2 })).toBe(
    '2 available targets'
  );
});
it('formats the actual Vietnamese target-count message with locale-appropriate plural rules', () => {
  const t = createTranslator({ locale: 'vi', messages: vietnamese.lettin });
  for (const count of [0, 1, 2])
    expect(t('relationshipTargetCount', { count })).toBe(
      `${count} mục khả dụng`
    );
});
