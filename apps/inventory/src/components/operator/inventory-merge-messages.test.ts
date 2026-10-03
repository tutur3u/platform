import { createTranslator } from 'next-intl';
import { describe, expect, it } from 'vitest';
import en from '../../../messages/en.json';
import vi from '../../../messages/vi.json';

describe('merge reference counts', () => {
  it('formats English zero, one and plural without ICU errors', () => {
    const t = createTranslator({
      locale: 'en',
      messages: en,
      namespace: 'inventory.operator.merge',
    });
    expect(t('references', { count: 0 })).toContain('0 related records');
    expect(t('references', { count: 1 })).toContain('1 related record will');
    expect(t('references', { count: 2 })).toContain('2 related records');
  });
  it('formats Vietnamese count plurals and retains the history notice', () => {
    const t = createTranslator({
      locale: 'vi',
      messages: vi,
      namespace: 'inventory.operator.merge',
    });
    for (const count of [0, 1, 2]) {
      expect(t('references', { count })).toContain(
        `${count} bản ghi liên quan`
      );
      expect(t('references', { count })).toContain('Lịch sử bán hàng');
    }
  });
});
