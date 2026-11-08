import { describe, expect, it } from 'vitest';
import { DEFAULT_FEE_NOTICE_TEMPLATE as DEFAULT } from './notice';
import { validateFeeNoticeTemplate } from './notice-template';

describe('validateFeeNoticeTemplate', () => {
  it('rejects unknown placeholders per field and over-long fields', () => {
    expect(validateFeeNoticeTemplate(DEFAULT)).toEqual([]);
    expect(
      validateFeeNoticeTemplate({
        ...DEFAULT,
        body: '{{ student_name }} {{phone}}',
        item_format: '{{name}} {{total}}',
        payment_line: '{{tuition}}',
        item_separator: ';'.repeat(21),
      })
    ).toEqual([
      { field: 'item_separator', code: 'too_long' },
      { field: 'body', code: 'unknown_placeholder', name: 'phone' },
      { field: 'item_format', code: 'unknown_placeholder', name: 'total' },
      { field: 'payment_line', code: 'unknown_placeholder', name: 'tuition' },
    ]);
  });

  it('rejects prototype names as unknown placeholders', () => {
    const body = '[{{constructor}}][{{__proto__}}][{{toString}}]';
    expect(
      validateFeeNoticeTemplate({ ...DEFAULT, body }).map(
        (i) => 'name' in i && i.name
      )
    ).toEqual(['constructor', '__proto__', 'toString']);
  });
});
