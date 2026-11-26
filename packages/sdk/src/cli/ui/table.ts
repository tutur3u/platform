import type { TableColumnSpec } from '../cli-contracts';
import { escapeTerminalText } from '../select';
import { createTheme, type Theme } from './theme';

export interface FormatTableOptions {
  columns?: TableColumnSpec[];
  compact?: boolean;
  emptyMessage?: string;
  fields?: string[];
  maxWidth?: number;
  noColor?: boolean;
  wide?: boolean;
}

const FLEXIBLE_COLUMN = /description|message|name|summary|title/i;

function textWidth(value: string): number {
  return [...value].length;
}

function formatCell(value: unknown): string {
  if (value == null) return '';
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return escapeTerminalText(String(value));
  }

  try {
    return escapeTerminalText(JSON.stringify(value) ?? '');
  } catch {
    return escapeTerminalText(String(value));
  }
}

function resolveColumns(
  rows: Record<string, unknown>[],
  options: FormatTableOptions
): TableColumnSpec[] {
  if (options.fields?.length) {
    return options.fields.map((key) => {
      const specified = options.columns?.find((column) => column.key === key);
      return specified ?? { key };
    });
  }

  if (options.columns?.length) return options.columns;

  const keys: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!key.startsWith('__') && !keys.includes(key)) keys.push(key);
    }
  }
  return keys.map((key) => ({ key }));
}

function resolveMaxWidth(options: FormatTableOptions): number {
  if (
    typeof options.maxWidth === 'number' &&
    Number.isFinite(options.maxWidth) &&
    options.maxWidth > 0
  ) {
    return Math.floor(options.maxWidth);
  }

  const columns = process.stdout.columns;
  if (typeof columns === 'number' && Number.isFinite(columns) && columns > 0) {
    return Math.floor(columns);
  }

  return options.wide ? 120 : 80;
}

function wrapCell(value: string, width: number): string[] {
  const normalized = value.replace(/\s+/g, ' ').trim();
  if (!normalized) return [''];

  const limit = Math.max(1, width);
  const lines: string[] = [];
  let current = '';

  const pushHard = (word: string) => {
    const chars = [...word];
    for (let index = 0; index < chars.length; index += limit) {
      lines.push(chars.slice(index, index + limit).join(''));
    }
  };

  for (const word of normalized.split(' ')) {
    if (textWidth(word) > limit) {
      if (current) {
        lines.push(current);
        current = '';
      }
      pushHard(word);
      continue;
    }

    if (!current) {
      current = word;
      continue;
    }

    const next = `${current} ${word}`;
    if (textWidth(next) <= limit) {
      current = next;
      continue;
    }

    lines.push(current);
    current = word;
  }

  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

function pad(value: string, width: number, align: 'left' | 'right'): string {
  const gap = Math.max(0, width - textWidth(value));
  const spaces = ' '.repeat(gap);
  return align === 'right' ? `${spaces}${value}` : `${value}${spaces}`;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function fitWidths(
  natural: number[],
  minimums: number[],
  flexible: boolean[],
  budget: number,
  wide: boolean
): number[] {
  const widths = natural.map((width, index) =>
    Math.max(width, minimums[index] ?? 1)
  );
  let overflow = sum(widths) - budget;

  if (overflow > 0) {
    const order = widths
      .map((width, index) => ({
        index,
        slack: width - Math.max(1, minimums[index] ?? 1),
      }))
      .filter((item) => item.slack > 0)
      .sort((left, right) => {
        const leftFlex = flexible[left.index] ? 1 : 0;
        const rightFlex = flexible[right.index] ? 1 : 0;
        if (leftFlex !== rightFlex) return rightFlex - leftFlex;
        return right.slack - left.slack;
      });

    for (const item of order) {
      if (overflow <= 0) break;
      const shrink = Math.min(item.slack, overflow);
      const current = widths[item.index] ?? 1;
      widths[item.index] = current - shrink;
      overflow -= shrink;
    }

    while (overflow > 0) {
      const index = widths.findIndex((width) => width > 1);
      if (index < 0) break;
      widths[index] = (widths[index] ?? 1) - 1;
      overflow -= 1;
    }

    return widths;
  }

  if (!wide) return widths;

  const targets = flexible.some(Boolean)
    ? flexible.flatMap((value, index) => (value ? [index] : []))
    : [Math.max(0, widths.length - 1)];
  let extra = budget - sum(widths);
  let cursor = 0;
  while (extra > 0 && targets.length > 0) {
    const index = targets[cursor % targets.length] ?? 0;
    widths[index] = (widths[index] ?? 1) + 1;
    extra -= 1;
    cursor += 1;
  }

  return widths;
}

function horizontal(
  widths: number[],
  left: string,
  middle: string,
  right: string,
  compact: boolean
): string {
  const bars = widths.map((width) => '─'.repeat(width));
  if (compact) return `${left}${bars.join(middle)}${right}`;
  return `${left}─${bars.join(`─${middle}─`)}─${right}`;
}

function renderRow(
  cells: string[],
  widths: number[],
  aligns: Array<'left' | 'right'>,
  bold: boolean,
  compact: boolean,
  theme: Theme
): string {
  const painted = cells.map((cell, index) => {
    const text = pad(cell, widths[index] ?? 0, aligns[index] ?? 'left');
    return bold ? theme.bold(text) : text;
  });
  const pipe = theme.dim('│');
  if (compact) return `${pipe}${painted.join(pipe)}${pipe}`;
  return `${pipe} ${painted.join(` ${pipe} `)} ${pipe}`;
}

export function formatTable(
  rows: Record<string, unknown>[],
  options: FormatTableOptions = {}
): string {
  const theme = createTheme({ noColor: options.noColor });
  if (rows.length === 0) {
    const message = options.emptyMessage ?? 'No results.';
    return `${theme.dim(theme.yellow(message))}\n`;
  }

  const columns = resolveColumns(rows, options);
  const compact = options.compact === true;
  const headers = columns.map((column) =>
    escapeTerminalText(column.label ?? column.key)
  );
  const body = rows.map((row) =>
    columns.map((column) => formatCell(row[column.key]))
  );
  const flexible = columns.map((column) =>
    FLEXIBLE_COLUMN.test(`${column.key} ${column.label ?? ''}`)
  );
  const minimums = columns.map((column, index) =>
    Math.max(
      1,
      column.minWidth ?? 1,
      Math.min(textWidth(headers[index] ?? ''), 3)
    )
  );
  const natural = columns.map((_column, index) =>
    Math.max(
      textWidth(headers[index] ?? ''),
      minimums[index] ?? 1,
      ...body.map((cells) => textWidth(cells[index] ?? ''))
    )
  );
  const chrome = compact ? columns.length + 1 : columns.length * 3 + 1;
  const budget = Math.max(columns.length, resolveMaxWidth(options) - chrome);
  const widths = fitWidths(
    natural,
    minimums,
    flexible,
    budget,
    options.wide === true
  );
  const aligns = columns.map((column) =>
    column.align === 'right' ? 'right' : 'left'
  );
  const headerAligns = columns.map(() => 'left' as const);

  const lines = [
    theme.dim(horizontal(widths, '┌', '┬', '┐', compact)),
    ...wrapLines(headers, widths).map((line) =>
      renderRow(line, widths, headerAligns, true, compact, theme)
    ),
    theme.dim(horizontal(widths, '├', '┼', '┤', compact)),
  ];

  for (const cells of body) {
    for (const line of wrapLines(cells, widths)) {
      lines.push(renderRow(line, widths, aligns, false, compact, theme));
    }
  }

  lines.push(theme.dim(horizontal(widths, '└', '┴', '┘', compact)));
  return `${lines.join('\n')}\n`;
}

function wrapLines(cells: string[], widths: number[]): string[][] {
  const wrapped = cells.map((cell, index) =>
    wrapCell(cell, widths[index] ?? 1)
  );
  const height = Math.max(1, ...wrapped.map((cell) => cell.length));
  return Array.from({ length: height }, (_, lineIndex) =>
    wrapped.map((cell) => cell[lineIndex] ?? '')
  );
}
