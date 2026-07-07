import { describe, expect, it } from 'vitest';
import { resolveStandardInvoiceCategoryId } from './standard-invoice';

describe('resolveStandardInvoiceCategoryId', () => {
  it('prefers a single linked product finance category', () => {
    expect(
      resolveStandardInvoiceCategoryId({
        defaultCategoryId: 'category-default',
        linkedFinanceCategoryIds: ['category-linked'],
      })
    ).toBe('category-linked');
  });

  it('requires explicit selection when linked product finance categories are mixed', () => {
    expect(
      resolveStandardInvoiceCategoryId({
        defaultCategoryId: 'category-default',
        linkedFinanceCategoryIds: ['category-a', 'category-b'],
      })
    ).toBe('');
  });

  it('falls back to the transaction default when products do not provide a category', () => {
    expect(
      resolveStandardInvoiceCategoryId({
        defaultCategoryId: 'category-default',
        linkedFinanceCategoryIds: [],
      })
    ).toBe('category-default');
  });
});
