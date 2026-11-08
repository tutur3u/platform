import { getCurrencyMinorUnits } from './calculator';

// Pure renderer shared by the template preview, the Excel notice column and the
// Phase-2 sender, always fed a locked revision snapshot. Default (Trà 15:12 Q1):
// one combined notice per student per period, covering all their classes plus
// any extras staff added. Output is PLAIN TEXT: HTML senders must escape it, and
// the Excel export must write it as a string cell (with sanitizeSpreadsheetText)
// so a value such as `=HYPERLINK(...)` never becomes a formula.

export type FeeNoticeGrouping = 'combined' | 'per_class';
export type FeeNoticeLocale = 'vi' | 'en';

export interface FeeNoticeTemplate {
  body: string;
  item_format: string;
  item_separator: string;
  payment_line: string;
  notice_grouping: FeeNoticeGrouping;
  locale: FeeNoticeLocale;
}

/** Structural subset of the v1 revision snapshot the renderer reads. */
export interface FeeNoticeSnapshot {
  student_name: string;
  period_month: string;
  currency: string;
  total_amount: number;
  lines: ReadonlyArray<{
    kind: 'tuition' | 'extra';
    group_id: string | null;
    group_name: string | null;
    label: string;
    unit_label: string | null;
    unit_price: number;
    quantity: number;
    line_amount: number;
    sort_order: number;
  }>;
}

export interface RenderedFeeNotice {
  /** The class this notice covers in per-class mode; null when combined. */
  group_id: string | null;
  text: string;
  length: number;
  truncated: boolean;
  over_soft_limit: boolean;
}

export const FEE_NOTICE_MAX_LENGTH = 2000;
export const DEFAULT_FEE_NOTICE_TEMPLATE: FeeNoticeTemplate = {
  body: '{{centre_name}} xin thông báo học phí tháng {{month}} của {{student_name}}: {{tuition}}{{items_with_prefix}}. Tổng: {{total}}đ. {{payment_line}} {{centre_name}} cảm ơn!',
  item_format: '{{name}}: {{price}}đ/{{unit}}',
  item_separator: ', ',
  payment_line:
    'Kính nhờ phụ huynh ghé trung tâm đóng tiền mặt giúp {{centre_name}} ạ.',
  notice_grouping: 'combined',
  locale: 'vi',
};

export const FEE_NOTICE_PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;
function isUnsafeCodePoint(code: number) {
  if (code === 0x0a) return false;
  return (
    code <= 0x1f ||
    (code >= 0x7f && code <= 0x9f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2066 && code <= 0x2069)
  );
}

/** Drops C0/C1 controls (except newline) and bidi overrides/isolates. */
export function stripControlCharacters(value: string) {
  let result = '';
  for (const char of value) {
    if (!isUnsafeCodePoint(char.codePointAt(0) ?? 0)) result += char;
  }
  return result;
}

/** Groups digits the vi-VN way (1.200.000) or en (1,200,000). */
export function formatFeeNoticeNumber(
  value: number,
  locale: FeeNoticeLocale,
  maxFractionDigits = 0
) {
  const [group, decimal] = locale === 'vi' ? ['.', ','] : [',', '.'];
  const fixed = Math.abs(value).toFixed(maxFractionDigits);
  const [whole = '0', fraction = ''] = fixed.split('.');
  const trimmed = fraction.replace(/0+$/, '');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, group);
  const sign = value < 0 && Number(fixed) !== 0 ? '-' : '';
  return `${sign}${grouped}${trimmed ? decimal + trimmed : ''}`;
}

// Own properties only: {{constructor}} or {{__proto__}} must not reach Object.prototype.
function fill(template: string, values: Record<string, string>) {
  return template.replace(FEE_NOTICE_PLACEHOLDER_PATTERN, (_m, name: string) =>
    Object.hasOwn(values, name) ? (values[name] ?? '') : ''
  );
}

// Cuts at a grapheme boundary so no surrogate pair or emoji sequence is split.
function capText(text: string, max: number) {
  let out = '';
  let count = 0;
  for (const { segment } of new Intl.Segmenter().segment(text)) {
    const size = Array.from(segment).length;
    if (count + size > max) break;
    out += segment;
    count += size;
  }
  return out;
}

type NoticeLine = FeeNoticeSnapshot['lines'][number];

function splitByClass(sorted: NoticeLine[]) {
  const tuition = sorted.filter((line) => line.kind === 'tuition');
  const extras = sorted.filter((line) => line.kind === 'extra');
  // Each extra belongs to exactly one tuition line: the first with its class,
  // else the first line, so lines sharing a group_id never duplicate it.
  const owner = (extra: NoticeLine) =>
    Math.max(
      0,
      tuition.findIndex((t) => t.group_id === extra.group_id)
    );
  return tuition.map((line, index) => ({
    group_id: line.group_id,
    lines: [line, ...extras.filter((extra) => owner(extra) === index)],
  }));
}

export function renderFeeNotice(
  snapshot: FeeNoticeSnapshot,
  template: FeeNoticeTemplate,
  options: {
    centreName: string;
    grouping?: FeeNoticeGrouping;
    locale?: FeeNoticeLocale;
    softLimit?: number;
  }
): RenderedFeeNotice[] {
  const locale = options.locale ?? template.locale;
  const grouping = options.grouping ?? template.notice_grouping;
  const minor = getCurrencyMinorUnits(snapshot.currency);
  const money = (n: number) => formatFeeNoticeNumber(n, locale, minor);
  const qty = (n: number) => formatFeeNoticeNumber(n, locale, 3);
  const suffix = snapshot.currency === 'VND' ? 'đ' : ` ${snapshot.currency}`;
  const sessionWord = locale === 'vi' ? 'buổi' : 'sessions';
  const clean = (s: string | null) => stripControlCharacters(s ?? '').trim();
  const [year = '', month = ''] = snapshot.period_month.split('-');

  const sorted = [...snapshot.lines].sort(
    (a, b) => a.sort_order - b.sort_order
  );
  const perClass =
    grouping === 'per_class' && sorted.some((l) => l.kind === 'tuition');
  const scopes = perClass
    ? splitByClass(sorted)
    : [{ group_id: null, lines: sorted }];

  return scopes.map((scope) => {
    const tuition = scope.lines.filter((line) => line.kind === 'tuition');
    const extras = scope.lines.filter((line) => line.kind === 'extra');
    const describe = (line: NoticeLine) =>
      `${money(line.line_amount)}${suffix}/${qty(line.quantity)} ${clean(line.unit_label) || sessionWord}`;
    const items = extras
      .map((line) =>
        fill(template.item_format, {
          name: clean(line.label),
          price: money(line.unit_price),
          unit: clean(line.unit_label),
          quantity: qty(line.quantity),
          amount: money(line.line_amount),
        })
      )
      .join(template.item_separator);
    const sum = (rows: NoticeLine[], pick: (l: NoticeLine) => number) =>
      rows.reduce((total, line) => total + pick(line), 0);
    const base = {
      centre_name: clean(options.centreName),
      month: `${month}/${year}`,
      student_name: clean(snapshot.student_name),
      class_name: tuition.map((line) => clean(line.group_name)).join(', '),
    };
    const values = {
      ...base,
      tuition:
        tuition.length === 1 && tuition[0]
          ? describe(tuition[0])
          : tuition
              .map((l) => `${clean(l.group_name)}: ${describe(l)}`)
              .join('; '),
      tuition_amount: money(sum(tuition, (l) => l.line_amount)),
      session_count: qty(sum(tuition, (l) => l.quantity)),
      items,
      items_with_prefix: items ? `, ${items}` : '',
      total: money(
        perClass
          ? sum(scope.lines, (l) => l.line_amount)
          : snapshot.total_amount
      ),
      payment_line: fill(template.payment_line, base),
    };
    const full = stripControlCharacters(fill(template.body, values));
    const length = Array.from(full).length;
    return {
      group_id: scope.group_id,
      text: capText(full, FEE_NOTICE_MAX_LENGTH),
      length,
      truncated: length > FEE_NOTICE_MAX_LENGTH,
      over_soft_limit:
        options.softLimit !== undefined && length > options.softLimit,
    };
  });
}
