import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FEE_NOTICE_TEMPLATE as DEFAULT,
  type FeeNoticeSnapshot,
  formatFeeNoticeNumber,
  renderFeeNotice,
  stripControlCharacters,
  validateFeeNoticeTemplate,
} from './notice';

type Line = FeeNoticeSnapshot['lines'][number];
const line = (overrides: Partial<Line>): Line => ({
  kind: 'tuition',
  group_id: 'g-a',
  group_name: 'Lớp A',
  label: 'Lớp A',
  unit_label: 'buổi',
  unit_price: 100_000,
  quantity: 8,
  line_amount: 800_000,
  sort_order: 0,
  ...overrides,
});

const book = line({
  kind: 'extra',
  group_id: 'g-b',
  label: 'Sách',
  unit_label: 'bộ',
  unit_price: 85_000,
  quantity: 1,
  line_amount: 85_000,
  sort_order: 2,
});

const snapshot = (lines: FeeNoticeSnapshot['lines']): FeeNoticeSnapshot => ({
  student_name: 'Nguyễn Văn Mẫu',
  period_month: '2026-12-01',
  currency: 'VND',
  total_amount: lines.reduce((sum, l) => sum + l.line_amount, 0),
  lines,
});

const twoClasses = snapshot([
  line({}),
  line({
    group_id: 'g-b',
    group_name: 'Lớp B',
    quantity: 4,
    line_amount: 400_000,
    sort_order: 1,
  }),
  book,
]);

const render = (s: FeeNoticeSnapshot, opts = {}) =>
  renderFeeNotice(s, DEFAULT, { centreName: 'Trung tâm Mẫu', ...opts });

describe('renderFeeNotice', () => {
  it('renders the default template for one class with no extras', () => {
    const [notice] = render(
      snapshot([line({ line_amount: 1_200_000, unit_price: 150_000 })])
    );
    expect(notice?.text).toBe(
      'Trung tâm Mẫu xin thông báo học phí tháng 12/2026 của Nguyễn Văn Mẫu: 1.200.000đ/8 buổi. Tổng: 1.200.000đ. Kính nhờ phụ huynh ghé trung tâm đóng tiền mặt giúp Trung tâm Mẫu ạ. Trung tâm Mẫu cảm ơn!'
    );
  });

  it('combines several classes and extras into one notice', () => {
    const notices = render(twoClasses);
    expect(notices).toHaveLength(1);
    expect(notices[0]?.text).toContain(
      ': Lớp A: 800.000đ/8 buổi; Lớp B: 400.000đ/4 buổi, Sách: 85.000đ/bộ. Tổng: 1.285.000đ.'
    );
  });

  it('splits per class, routing tagged extras to their class and untagged to the first', () => {
    const tagged = render(twoClasses, { grouping: 'per_class' });
    expect(tagged.map((n) => n.group_id)).toEqual(['g-a', 'g-b']);
    expect(tagged[0]?.text).toContain(': 800.000đ/8 buổi. Tổng: 800.000đ.');
    expect(tagged[1]?.text).toContain(
      ': 400.000đ/4 buổi, Sách: 85.000đ/bộ. Tổng: 485.000đ.'
    );

    const untagged = snapshot([
      ...twoClasses.lines.slice(0, 2),
      { ...book, group_id: null },
    ]);
    const [first, second] = render(untagged, { grouping: 'per_class' });
    expect(first?.text).toContain('Sách');
    expect(second?.text).not.toContain('Sách');
  });

  it('never re-expands placeholders found in data and strips control characters', () => {
    const [notice] = render({
      ...snapshot([line({})]),
      student_name: '{{centre_name}}\u0007 Bé',
    });
    expect(notice?.text).toContain('của {{centre_name}} Bé:');
    const raw = `a${String.fromCodePoint(0)}b\nc${String.fromCodePoint(0x202e, 0x2066)}d`;
    expect(stripControlCharacters(raw)).toBe('ab\ncd');
  });

  it('caps notices at 2,000 characters and flags the soft limit', () => {
    const long = { ...snapshot([line({})]), student_name: 'x'.repeat(2500) };
    const [notice] = render(long, { softLimit: 640 });
    expect(notice).toMatchObject({ truncated: true, over_soft_limit: true });
    expect(notice?.text).toHaveLength(2000);
    expect(notice?.length).toBeGreaterThan(2500);
  });

  it('supports the en locale and non-VND currencies', () => {
    const usd = snapshot([line({ line_amount: 1234.5, quantity: 1.5 })]);
    const body = '{{tuition}} | {{session_count}} | {{total}}';
    const [notice] = renderFeeNotice(
      { ...usd, currency: 'USD' },
      { ...DEFAULT, body },
      { centreName: 'C', locale: 'en' }
    );
    expect(notice?.text).toBe('1,234.5 USD/1.5 buổi | 1.5 | 1,234.5');
  });
});

describe('template helpers', () => {
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

  it('formats numbers with vi-VN and en grouping', () => {
    expect(formatFeeNoticeNumber(1_200_000, 'vi')).toBe('1.200.000');
    expect(formatFeeNoticeNumber(1_200_000, 'en')).toBe('1,200,000');
    expect(formatFeeNoticeNumber(1234.5, 'vi', 2)).toBe('1.234,5');
    expect(formatFeeNoticeNumber(-0.001, 'vi')).toBe('0');
  });
});
