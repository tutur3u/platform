import { inspect } from 'node:util';
import { escapeTerminalText } from './select';
import { getDateParts, inferUserTimeZone } from './timezone';

type RenderableRecord = Record<string, unknown>;
type TableCellStyle = (input: {
  column: string;
  row: RenderableRecord;
  value: string;
}) => string;

type ColorCode = 1 | 2 | 22 | 31 | 32 | 33 | 34 | 35 | 36 | 37 | 90;

export interface RenderOptions {
  calendarResource?: string;
  compact?: boolean;
  currentWorkspaceId?: string;
  financeResource?: string;
  group?: string;
  json?: boolean;
  workspaceName?: string;
}

function asRecord(value: unknown): RenderableRecord {
  return value && typeof value === 'object' ? (value as RenderableRecord) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function asTerminalString(value: unknown, fallback = '') {
  return escapeTerminalText(asString(value, fallback));
}

function supportsColor() {
  return (
    process.stdout.isTTY &&
    process.env.NO_COLOR === undefined &&
    process.env.TERM !== 'dumb'
  );
}

function colorize(code: ColorCode, value: string) {
  return supportsColor() ? `\x1b[${code}m${value}\x1b[0m` : value;
}

const color = {
  blue: (value: string) => colorize(34, value),
  bold: (value: string) => colorize(1, value),
  cyan: (value: string) => colorize(36, value),
  dim: (value: string) => colorize(2, value),
  green: (value: string) => colorize(32, value),
  magenta: (value: string) => colorize(35, value),
  red: (value: string) => colorize(31, value),
  yellow: (value: string) => colorize(33, value),
};

const ansiPattern = new RegExp(['\\u001B', '\\[[0-9;]*m'].join(''), 'g');

function stripAnsi(value: string) {
  return value.replace(ansiPattern, '');
}

function visibleLength(value: string) {
  return stripAnsi(value).length;
}

function padVisible(value: string, width: number) {
  return `${value}${' '.repeat(Math.max(0, width - visibleLength(value)))}`;
}

function terminalWidth() {
  const columns = process.stdout.columns;
  return typeof columns === 'number' && Number.isFinite(columns) && columns > 0
    ? Math.max(40, Math.floor(columns))
    : 120;
}

function tableWidth(widths: number[]) {
  return (
    widths.reduce((total, width) => total + width, 0) + widths.length * 3 + 1
  );
}

function isFlexibleColumnName(name: string) {
  return /description|name|title/i.test(name);
}

function getPreferredMinimumWidth(
  columnName: string,
  desiredWidth: number,
  index: number
) {
  if (index === 0) return desiredWidth;

  const normalized = columnName.toLowerCase();
  const preferred = (() => {
    switch (normalized) {
      case 'key':
        return 6;
      case 'title':
      case 'name':
        return 24;
      case 'list':
      case 'workspace':
        return 12;
      case 'board':
        return 7;
      case 'status':
        return 6;
      case 'priority':
        return 8;
      case 'due':
        return 8;
      case 'id':
        return 12;
      default:
        return Math.max(visibleLength(columnName), 6);
    }
  })();

  return Math.min(desiredWidth, preferred);
}

function getHardMinimumWidth(columnName: string, index: number) {
  if (index === 0) return 1;

  const normalized = columnName.toLowerCase();
  if (normalized === 'title' || normalized === 'name') return 10;
  if (normalized === 'key') return 4;
  if (normalized === 'list' || normalized === 'board') return 4;
  if (normalized === 'status' || normalized === 'priority') return 4;
  return 3;
}

function fitWidthsToTerminal(widths: number[], columnNames: string[]) {
  const maxWidth = terminalWidth();
  if (tableWidth(widths) <= maxWidth) return widths;

  const maxContentWidth = Math.max(
    widths.length,
    maxWidth - (widths.length * 3 + 1)
  );
  const minWidths = widths.map((width, index) =>
    getPreferredMinimumWidth(columnNames[index] ?? '', width, index)
  );

  while (
    minWidths.reduce((total, width) => total + width, 0) > maxContentWidth
  ) {
    const candidate = minWidths
      .map((width, index) => ({
        index,
        shrinkableBy:
          width - getHardMinimumWidth(columnNames[index] ?? '', index),
      }))
      .filter((item) => item.shrinkableBy > 0)
      .sort((left, right) => right.shrinkableBy - left.shrinkableBy)[0];

    if (!candidate) break;
    minWidths[candidate.index] = (minWidths[candidate.index] ?? 1) - 1;
  }

  const nextWidths = [...minWidths];
  let remainingWidth =
    maxContentWidth - minWidths.reduce((total, width) => total + width, 0);

  const allocate = (index: number, limit = Number.POSITIVE_INFINITY) => {
    if (remainingWidth <= 0) return;
    const desiredWidth = widths[index] ?? 0;
    const currentWidth = nextWidths[index] ?? 0;
    const extraWidth = Math.min(
      desiredWidth - currentWidth,
      limit,
      remainingWidth
    );
    if (extraWidth <= 0) return;
    nextWidths[index] = currentWidth + extraWidth;
    remainingWidth -= extraWidth;
  };

  const flexibleIndexes = columnNames
    .map((name, index) => (isFlexibleColumnName(name) ? index : -1))
    .filter((index) => index > 0);
  const fixedIndexes = widths
    .map((_, index) => index)
    .filter((index) => index > 0 && !flexibleIndexes.includes(index));

  for (const index of fixedIndexes) {
    allocate(index);
  }

  for (const index of flexibleIndexes) {
    allocate(
      index,
      Math.max(0, Math.floor(maxWidth * 0.45) - (nextWidths[index] ?? 0))
    );
  }

  while (remainingWidth > 0) {
    const candidates = widths
      .map((width, index) => ({
        index,
        remaining: width - (nextWidths[index] ?? 0),
      }))
      .filter((candidate) => candidate.remaining > 0)
      .sort((left, right) => {
        const leftFlexible = flexibleIndexes.includes(left.index);
        const rightFlexible = flexibleIndexes.includes(right.index);
        if (leftFlexible !== rightFlexible) return leftFlexible ? -1 : 1;
        return right.remaining - left.remaining;
      });

    const candidate = candidates[0];
    if (!candidate) break;
    allocate(candidate.index, 1);
  }

  return nextWidths;
}

function splitLongToken(value: string, width: number) {
  const segments: string[] = [];
  let remaining = value;

  while (visibleLength(remaining) > width) {
    segments.push(remaining.slice(0, width));
    remaining = remaining.slice(width);
  }

  if (remaining) segments.push(remaining);
  return segments;
}

function wrapCell(value: string, width: number) {
  const normalized = stripAnsi(value).replace(/\s+/g, ' ').trim();
  if (!normalized) return [''];

  const lines: string[] = [];
  let currentLine = '';

  for (const word of normalized.split(' ')) {
    if (visibleLength(word) > width) {
      if (currentLine) {
        lines.push(currentLine);
        currentLine = '';
      }
      lines.push(...splitLongToken(word, width));
      continue;
    }

    if (!currentLine) {
      currentLine = word;
      continue;
    }

    if (visibleLength(`${currentLine} ${word}`) <= width) {
      currentLine = `${currentLine} ${word}`;
      continue;
    }

    lines.push(currentLine);
    currentLine = word;
  }

  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [''];
}

function asTimestamp(value: unknown) {
  if (typeof value !== 'string' || !value.trim())
    return Number.POSITIVE_INFINITY;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : Number.POSITIVE_INFINITY;
}

function getNestedRecord(value: unknown, key: string) {
  return asRecord(asRecord(value)[key]);
}

function getTaskListName(task: unknown) {
  const record = asRecord(task);
  return asString(
    getNestedRecord(task, 'task_lists').name,
    asString(record.list_name, asString(record.list_id, 'No list'))
  );
}

function getTaskListColor(task: unknown) {
  const record = asRecord(task);
  return asString(
    getNestedRecord(task, 'task_lists').color,
    asString(record.list_color)
  );
}

function getTaskBoardName(task: unknown) {
  const record = asRecord(task);
  const boardName = asString(
    record.board_name,
    asString(record.board_id, 'No board')
  );
  const workspaceName = getTaskWorkspaceName(task);

  return workspaceName ? `${workspaceName} / ${boardName}` : boardName;
}

function getTaskWorkspaceName(task: unknown, fallback = '') {
  const record = asRecord(task);
  return asString(
    record.source_workspace_name,
    asString(record.workspace_name, fallback)
  );
}

function getTaskStatus(task: unknown) {
  const record = asRecord(task);
  if (record.closed_at) return 'closed';
  if (record.completed_at || record.completed === true) return 'done';
  return 'open';
}

function getTaskKey(task: unknown) {
  const record = asRecord(task);
  const displayKey = asString(record.display_key);
  if (displayKey) return displayKey;

  const prefix = asString(record.ticket_prefix);
  const displayNumber = record.display_number;

  if (prefix && typeof displayNumber === 'number') {
    return `${prefix}-${displayNumber}`;
  }

  return asString(record.id);
}

function getTaskPriorityRank(task: unknown) {
  const priority = asString(asRecord(task).priority).toLowerCase();
  const rankByPriority: Record<string, number> = {
    critical: 0,
    high: 1,
    normal: 2,
    low: 3,
  };

  return rankByPriority[priority] ?? 4;
}

function compareTasksForCli(left: unknown, right: unknown) {
  const priorityDiff = getTaskPriorityRank(left) - getTaskPriorityRank(right);
  if (priorityDiff !== 0) return priorityDiff;

  const dueDiff =
    asTimestamp(asRecord(left).end_date) -
    asTimestamp(asRecord(right).end_date);
  if (dueDiff !== 0) return dueDiff;

  const createdDiff =
    asTimestamp(asRecord(right).created_at) -
    asTimestamp(asRecord(left).created_at);
  if (createdDiff !== 0) return createdDiff;

  return asString(asRecord(left).name).localeCompare(
    asString(asRecord(right).name)
  );
}

export function sortTasksForCli(tasks: unknown[]) {
  return [...tasks].sort(compareTasksForCli);
}

export function sortTaskResponseForCli(data: unknown) {
  const record = asRecord(data);
  const tasks = asArray(record.tasks);
  return tasks.length > 0 ? { ...record, tasks: sortTasksForCli(tasks) } : data;
}

function formatDueDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  const now = new Date();
  const timeZone = inferUserTimeZone();
  const nowParts = getDateParts(now, timeZone);
  const dueParts = getDateParts(date, timeZone);
  const startOfToday = Date.UTC(
    nowParts.year,
    nowParts.month - 1,
    nowParts.day
  );
  const startOfDueDate = Date.UTC(
    dueParts.year,
    dueParts.month - 1,
    dueParts.day
  );
  const dayDiff = Math.round((startOfDueDate - startOfToday) / 86_400_000);

  if (dayDiff === -1) return 'Yesterday';
  if (dayDiff === 0) return 'Today';
  if (dayDiff === 1) return 'Tomorrow';

  const sameYear = dueParts.year === nowParts.year;
  const options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    ...(timeZone ? { timeZone } : {}),
  };

  return new Intl.DateTimeFormat('en', options).format(date);
}

function getNamedColorCode(value: string): ColorCode {
  switch (value.trim().toLowerCase()) {
    case 'red':
    case 'rose':
    case 'pink':
      return 31;
    case 'green':
    case 'emerald':
    case 'lime':
      return 32;
    case 'yellow':
    case 'amber':
    case 'orange':
      return 33;
    case 'blue':
    case 'sky':
      return 34;
    case 'purple':
    case 'violet':
    case 'magenta':
      return 35;
    case 'cyan':
    case 'teal':
      return 36;
    case 'white':
      return 37;
    default:
      return 90;
  }
}

function colorizeHex(value: string, colorValue: string) {
  const match = colorValue.trim().match(/^#?([a-f\d]{6})$/i);
  if (!match || !supportsColor()) return value;
  const hex = match[1] ?? '';
  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  return `\x1b[38;2;${red};${green};${blue}m${value}\x1b[0m`;
}

function colorizeConfigured(value: string, colorValue: string) {
  if (!value || !colorValue.trim()) return value;
  return /^#?[a-f\d]{6}$/i.test(colorValue.trim())
    ? colorizeHex(value, colorValue)
    : colorize(getNamedColorCode(colorValue), value);
}

function formatColorSwatch(colorValue: string) {
  if (!colorValue) return '';
  return colorizeConfigured('■', colorValue);
}

function formatListName(name: string, colorValue: string) {
  if (!name) return '';
  const swatch = formatColorSwatch(colorValue);
  return swatch ? `${swatch} ${colorizeConfigured(name, colorValue)}` : name;
}

function renderTable(
  rows: RenderableRecord[],
  options: { styleCell?: TableCellStyle } = {}
) {
  if (rows.length === 0) {
    process.stdout.write(`${color.yellow('No results.')}\n`);
    return;
  }

  const columns = Object.keys(rows[0] ?? {}).filter(
    (column) => !column.startsWith('__')
  );
  const tableRows = rows.map((row, index) => ({
    index: String(index + 1),
    row,
    cells: columns.map((column) =>
      escapeTerminalText(String(row[column] ?? ''))
    ),
  }));

  const columnNames = ['', ...columns];
  const widths = fitWidthsToTerminal(
    [
      Math.max(String(rows.length).length, 1),
      ...columns.map((column, columnIndex) =>
        Math.max(
          visibleLength(column),
          ...tableRows.map((tableRow) => {
            const value = tableRow.cells[columnIndex] ?? '';
            return visibleLength(
              options.styleCell?.({
                column,
                row: tableRow.row,
                value,
              }) ?? value
            );
          })
        )
      ),
    ],
    columnNames
  );

  const topSeparator = color.dim(
    `┌─${widths.map((width) => '─'.repeat(width)).join('─┬─')}─┐`
  );
  const middleSeparator = color.dim(
    `├─${widths.map((width) => '─'.repeat(width)).join('─┼─')}─┤`
  );
  const bottomSeparator = color.dim(
    `└─${widths.map((width) => '─'.repeat(width)).join('─┴─')}─┘`
  );
  const formatRow = (cells: string[]) =>
    `${color.dim('│')} ${cells
      .map((cell, index) => padVisible(cell, widths[index] ?? 0))
      .join(` ${color.dim('│')} `)} ${color.dim('│')}`;

  process.stdout.write(`${topSeparator}\n`);
  for (const headerCells of wrapTableRow(['', ...columns])) {
    process.stdout.write(
      `${formatRow(headerCells.map((cell) => (cell ? color.bold(cell) : '')))}\n`
    );
  }
  process.stdout.write(`${middleSeparator}\n`);
  for (const row of tableRows) {
    const rawCells = [row.index, ...row.cells];
    for (const [lineIndex, cells] of wrapTableRow(rawCells).entries()) {
      process.stdout.write(
        `${formatRow(
          cells.map((cell, cellIndex) => {
            if (cellIndex === 0) return lineIndex === 0 ? color.dim(cell) : '';

            const column = columns[cellIndex - 1] ?? '';
            return (
              options.styleCell?.({ column, row: row.row, value: cell }) ?? cell
            );
          })
        )}\n`
      );
    }
  }
  process.stdout.write(`${bottomSeparator}\n`);

  function wrapTableRow(cells: string[]) {
    const wrappedCells = cells.map((cell, index) =>
      wrapCell(cell, widths[index] ?? 1)
    );
    const rowHeight = Math.max(...wrappedCells.map((cell) => cell.length));

    return Array.from({ length: rowHeight }, (_, lineIndex) =>
      wrappedCells.map((cell) => cell[lineIndex] ?? '')
    );
  }
}

function styleTier(value: string) {
  const normalized = value.toLowerCase();
  if (normalized.includes('pro')) return color.magenta(value);
  if (normalized.includes('plus')) return color.blue(value);
  if (normalized.includes('free')) return color.green(value);
  return value;
}

function styleTaskCell({ column, row, value }: Parameters<TableCellStyle>[0]) {
  if (column === 'Key') return color.cyan(value);
  if (column === 'List' && value)
    return formatListName(value, asString(row.__ListColor));
  if (column === 'Status') {
    if (value === 'open') return color.green(value);
    if (value === 'done') return color.blue(value);
    if (value === 'closed') return color.dim(value);
  }
  if (column === 'Priority') {
    if (value === 'critical') return color.bold(color.red(value));
    if (value === 'high') return color.yellow(value);
    if (value === 'normal') return color.cyan(value);
    if (value === 'low') return color.dim(value);
  }
  if (column === 'Due') {
    if (value === 'Yesterday') return color.red(value);
    if (value === 'Today') return color.yellow(value);
    if (value === 'Tomorrow') return color.magenta(value);
  }
  return value;
}

function styleWorkspaceCell({
  column,
  row,
  value,
}: Parameters<TableCellStyle>[0]) {
  if (column === 'Name' && row.Current === 'yes') return color.bold(value);
  if (column === 'Current' && value) return color.green(value);
  if (column === 'Personal' && value) return color.cyan(value);
  if (column === 'Tier') return styleTier(value);
  return value;
}

function styleListCell({ column, row, value }: Parameters<TableCellStyle>[0]) {
  if (column === 'Status') {
    if (value === 'done') return color.blue(value);
    if (value === 'closed') return color.dim(value);
    if (value === 'active') return color.green(value);
    if (value === 'not_started') return color.yellow(value);
  }
  if (column === 'Name' && value)
    return formatListName(value, asString(row.__Color));
  if (column === 'Color' && value)
    return `${formatColorSwatch(value)} ${value}`;
  return value;
}

function styleProjectCell({ column, value }: Parameters<TableCellStyle>[0]) {
  if (column === 'Status') {
    if (value === 'active') return color.green(value);
    if (value === 'archived') return color.dim(value);
  }
  return value;
}

function renderWorkspaces(data: unknown, currentWorkspaceId?: string) {
  renderTable(
    asArray(data).map((workspace) => {
      const record = asRecord(workspace);
      return {
        Name: asString(record.name, 'Untitled workspace'),
        Id: asString(record.id),
        Current:
          record.id === currentWorkspaceId ||
          (currentWorkspaceId === 'personal' && record.personal === true)
            ? 'yes'
            : '',
        Personal: record.personal === true ? 'yes' : '',
        Tier: asString(record.tier),
      };
    }),
    { styleCell: styleWorkspaceCell }
  );
}

function renderBoards(data: unknown) {
  const boards = asArray(asRecord(data).boards);
  renderTable(
    boards.map((board) => {
      const record = asRecord(board);
      return {
        Name: asString(record.name, 'Untitled board'),
        Id: asString(record.id),
        Prefix: asString(record.ticket_prefix),
        Lists: record.list_count ?? '',
        Tasks: record.task_count ?? '',
      };
    })
  );
}

function renderLists(data: unknown) {
  renderTable(
    asArray(asRecord(data).lists).map((list) => {
      const record = asRecord(list);
      return {
        Name: asString(record.name, 'Untitled list'),
        Id: asString(record.id),
        Status: asString(record.status),
        Color: asString(record.color),
        __Color: asString(record.color),
      };
    }),
    { styleCell: styleListCell }
  );
}

function renderLabels(data: unknown) {
  renderTable(
    asArray(data).map((label) => {
      const record = asRecord(label);
      return {
        Name: asString(record.name, 'Untitled label'),
        Id: asString(record.id),
        Color: asString(record.color),
      };
    }),
    {
      styleCell: ({ column, value }) =>
        column === 'Color' && value ? color.cyan(value) : value,
    }
  );
}

function renderProjects(data: unknown) {
  renderTable(
    asArray(data).map((project) => {
      const record = asRecord(project);
      return {
        Name: asString(record.name, 'Untitled project'),
        Id: asString(record.id),
        Status: asString(record.status),
      };
    }),
    { styleCell: styleProjectCell }
  );
}

function formatFinanceDate(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const timeZone = inferUserTimeZone();
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short',
    ...(timeZone ? { timeZone } : {}),
    year: 'numeric',
  }).format(date);
}

function formatFinanceAmount(value: unknown) {
  if (typeof value !== 'number') return value ?? '';
  return new Intl.NumberFormat('en', {
    maximumFractionDigits: 2,
  }).format(value);
}

function financeRows(data: unknown, resource?: string) {
  const record = asRecord(data);
  const rows =
    asArray(record.data).length > 0 ? asArray(record.data) : asArray(data);

  switch (resource) {
    case 'wallets':
      return rows.map((item) => {
        const row = asRecord(item);
        return {
          Name: asString(row.name, 'Untitled wallet'),
          Id: asString(row.id),
          Type: asString(row.type),
          Balance: formatFinanceAmount(row.balance),
          Currency: asString(row.currency),
        };
      });
    case 'wallet-balances':
      return rows.map((item) => {
        const row = asRecord(item);
        return {
          Name: asString(row.name, 'Untitled wallet'),
          Id: asString(row.id),
          Balance: formatFinanceAmount(row.balance),
          Currency: asString(row.currency),
        };
      });
    case 'checkpoints':
      return rows.map((item) => {
        const row = asRecord(item);
        return {
          CheckedAt: formatFinanceDate(row.checked_at),
          Actual: formatFinanceAmount(row.actual_balance),
          Ledger: formatFinanceAmount(row.ledger_balance),
          Variance: formatFinanceAmount(row.original_variance),
          Current: formatFinanceAmount(row.current_variance),
          Currency: asString(row.currency),
          Note: asString(row.note),
          Wallet: asString(row.wallet_id),
          Id: asString(row.id),
        };
      });
    case 'checkpoint-intervals':
      return rows.map((item) => {
        const row = asRecord(item);
        return {
          From: formatFinanceDate(row.start_checked_at),
          To: formatFinanceDate(row.end_checked_at),
          ActualDelta: formatFinanceAmount(row.actual_delta),
          LedgerDelta: formatFinanceAmount(row.ledger_delta),
          Variance: formatFinanceAmount(row.interval_variance),
          Txns: row.transaction_count ?? '',
          Status: row.is_clean === true ? 'clean' : 'unresolved',
        };
      });
    case 'checkpoint-summary-wallets':
      return rows.map((item) => {
        const row = asRecord(item);
        return {
          Name: asString(row.name, 'Untitled wallet'),
          Id: asString(row.id),
          Balance: formatFinanceAmount(row.balance),
          Currency: asString(row.currency),
          Type: asString(row.type),
        };
      });
    case 'checkpoint-totals':
      return rows.map((item) => {
        const row = asRecord(item);
        return {
          Currency: asString(row.currency),
          Actual: formatFinanceAmount(row.actual_total),
          Ledger: formatFinanceAmount(row.ledger_total),
          Variance: formatFinanceAmount(row.variance_total),
          Count: row.checkpoint_count ?? '',
        };
      });
    case 'transactions':
      return rows.map((item) => {
        const row = asRecord(item);
        return {
          Date: formatFinanceDate(row.taken_at),
          Amount: formatFinanceAmount(row.amount),
          Description: asString(row.description),
          Wallet: asString(row.wallet, asString(row.wallet_name)),
          Category: asString(row.category, asString(row.category_name)),
          Id: asString(row.id, asString(row.transaction_id)),
        };
      });
    case 'categories':
      return rows.map((item) => {
        const row = asRecord(item);
        return {
          Name: asString(row.name, 'Untitled category'),
          Id: asString(row.id),
          Type: row.is_expense === false ? 'income' : 'expense',
          Description: asString(row.description),
          Amount: formatFinanceAmount(row.amount),
          Count: row.transaction_count ?? '',
          Color: asString(row.color),
        };
      });
    case 'tags':
      return rows.map((item) => {
        const row = asRecord(item);
        return {
          Name: asString(row.name, 'Untitled tag'),
          Id: asString(row.id),
          Description: asString(row.description),
          Amount: formatFinanceAmount(row.amount ?? row.net_total),
          Count: row.transaction_count ?? '',
          Color: asString(row.color),
        };
      });
    case 'budgets':
      return rows.map((item) => {
        const row = asRecord(item);
        return {
          Name: asString(row.name, 'Untitled budget'),
          Id: asString(row.id),
          Amount: formatFinanceAmount(row.amount),
          Period: asString(row.period),
          Start: formatFinanceDate(row.start_date),
          End: formatFinanceDate(row.end_date),
        };
      });
    case 'budget-status':
      return rows.map((item) => {
        const row = asRecord(item);
        return {
          Name: asString(row.budget_name, 'Untitled budget'),
          Id: asString(row.budget_id),
          Amount: formatFinanceAmount(row.amount),
          Spent: formatFinanceAmount(row.spent),
          Remaining: formatFinanceAmount(row.remaining),
          Used: row.percentage_used ? `${row.percentage_used}%` : '',
        };
      });
    case 'recurring':
    case 'upcoming-recurring':
      return rows.map((item) => {
        const row = asRecord(item);
        return {
          Name: asString(row.name, 'Untitled recurring transaction'),
          Id: asString(row.id),
          Amount: formatFinanceAmount(row.amount),
          Frequency: asString(row.frequency),
          Next: formatFinanceDate(row.next_occurrence),
          Active: row.is_active === false ? 'no' : 'yes',
        };
      });
    case 'transfers':
      return rows.map((item) => {
        const row = asRecord(item);
        return {
          Message: asString(row.message),
          From: asString(row.from_transaction_id),
          To: asString(row.to_transaction_id),
        };
      });
    default:
      return rows.map(asRecord);
  }
}

function renderFinance(data: unknown, resource?: string) {
  const record = asRecord(data);
  if (resource === 'checkpoint-summary') {
    if (Array.isArray(record.wallets)) {
      process.stdout.write(`${color.bold('Wallets')}\n`);
      renderTable(financeRows(record.wallets, 'checkpoint-summary-wallets'));
    }
    if (Array.isArray(record.latest_checkpoints)) {
      process.stdout.write(`${color.bold('Latest Checkpoints')}\n`);
      renderTable(financeRows(record.latest_checkpoints, 'checkpoints'));
    }
    if (Array.isArray(record.totals_by_currency)) {
      process.stdout.write(`${color.bold('Totals')}\n`);
      renderTable(financeRows(record.totals_by_currency, 'checkpoint-totals'));
    }
    return;
  }

  if (
    (resource === 'checkpoints' || resource === 'checkpoint-batch') &&
    Array.isArray(record.data)
  ) {
    process.stdout.write(`${color.bold('Checkpoints')}\n`);
    renderTable(financeRows(record.data, 'checkpoints'));
    if (Array.isArray(record.intervals)) {
      process.stdout.write(`${color.bold('Intervals')}\n`);
      renderTable(financeRows(record.intervals, 'checkpoint-intervals'));
    }
    if (Array.isArray(record.totals_by_currency)) {
      process.stdout.write(`${color.bold('Totals')}\n`);
      renderTable(financeRows(record.totals_by_currency, 'checkpoint-totals'));
    }
    return;
  }

  if (
    resource === 'wallet-balances' &&
    Array.isArray(record.wallets) &&
    Array.isArray(record.totals)
  ) {
    process.stdout.write(`${color.bold('Wallets')}\n`);
    renderTable(financeRows(record.wallets, resource));
    process.stdout.write(`${color.bold('Totals')}\n`);
    renderTable(
      asArray(record.totals).map((item) => {
        const row = asRecord(item);
        return {
          Currency: asString(row.currency),
          Balance: formatFinanceAmount(row.balance),
        };
      })
    );
    return;
  }

  if (resource === 'wallet-balances' && record.id) {
    renderTable(financeRows([record], resource));
    return;
  }

  if (resource === 'transfers' && record.message) {
    renderTable(financeRows([record], resource));
    return;
  }

  if (Array.isArray(data) || Array.isArray(record.data)) {
    renderTable(financeRows(data, resource));
    const paginationText = getPaginationText(record);
    if (paginationText) {
      process.stdout.write(`${color.dim(paginationText)}\n`);
    }
    return;
  }

  if (record.message && Object.keys(record).length <= 2) {
    process.stdout.write(`${asString(record.message)}\n`);
    return;
  }

  renderTable(financeRows([data], resource));
}

function formatCalendarDateTime(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function calendarRows(data: unknown, resource?: string) {
  const record = asRecord(data);
  const rows = (() => {
    if (Array.isArray(data)) return data;
    if (Array.isArray(record.data)) return record.data;
    if (Array.isArray(record.calendars)) return record.calendars;
    if (Array.isArray(record.categories)) return record.categories;
    if (Array.isArray(record.accounts)) return record.accounts;
    if (Array.isArray(record.connections)) return record.connections;
    if (Array.isArray(record.tasks)) return record.tasks;
    if (Array.isArray(record.options)) return record.options;
    return [data];
  })();

  switch (resource) {
    case 'accounts':
      return rows.map((item) => {
        const row = asRecord(item);
        return {
          Provider: asString(row.provider),
          Account: asString(row.account_email, asString(row.email)),
          Name: asString(row.account_name, asString(row.name)),
          Active: row.is_active === false ? 'no' : 'yes',
          Id: asString(row.id),
        };
      });
    case 'calendars':
      return rows.map((item) => {
        const row = asRecord(item);
        return {
          Name: asString(row.name, 'Untitled calendar'),
          Id: asString(row.id),
          Type: asString(row.calendar_type),
          Enabled: row.is_enabled === false ? 'no' : 'yes',
          System: row.is_system === true ? 'yes' : 'no',
          Color: asString(row.color),
        };
      });
    case 'categories':
      return rows.map((item) => {
        const row = asRecord(item);
        return {
          Name: asString(row.name, 'Untitled category'),
          Id: asString(row.id),
          Position: row.position ?? '',
          Color: asString(row.color),
        };
      });
    case 'connections':
      return rows.map((item) => {
        const row = asRecord(item);
        return {
          Calendar: asString(row.calendar_name),
          Provider: asString(row.provider),
          Id: asString(row.id),
          CalendarId: asString(row.calendar_id),
          Account: asString(row.auth_token_id),
          Enabled: row.is_enabled === false ? 'no' : 'yes',
        };
      });
    case 'events':
      return rows.map((item) => {
        const row = asRecord(item);
        return {
          Start: formatCalendarDateTime(row.start_at),
          End: formatCalendarDateTime(row.end_at),
          Title: asString(row.title, 'Untitled event'),
          Provider: asString(row.provider),
          Locked: row.locked === true ? 'yes' : 'no',
          Id: asString(row.id),
        };
      });
    case 'provider-calendars':
      return rows.map((item) => {
        const row = asRecord(item);
        return {
          Name: asString(row.name),
          Provider: asString(row.provider),
          Account: asString(row.accountEmail),
          Role: asString(row.accessRole),
          Primary: row.primary === true ? 'yes' : 'no',
          Id: asString(row.id),
        };
      });
    case 'schedule-tasks':
      return rows.map((item) => {
        const row = asRecord(item);
        return {
          Name: asString(row.name, 'Untitled task'),
          Id: asString(row.id),
          Duration: row.total_duration ?? '',
          Scheduled: row.scheduled_minutes ?? '',
          Completed: row.completed_minutes ?? '',
        };
      });
    case 'sources':
      return rows.map((item) => {
        const row = asRecord(item);
        return {
          Label: asString(row.label),
          Provider: asString(row.provider),
          Writable: row.writable === false ? 'no' : 'yes',
          Primary: row.primary === true ? 'yes' : 'no',
          Id: asString(row.id),
        };
      });
    default:
      return rows.map(asRecord);
  }
}

function renderCalendar(data: unknown, resource?: string) {
  const record = asRecord(data);

  if (resource === 'auth' && record.authUrl) {
    process.stdout.write(`${asString(record.authUrl)}\n`);
    return;
  }

  if (resource === 'schedule') {
    const statistics = asRecord(record.statistics);
    const schedulableItems = asRecord(record.schedulableItems);
    renderTable([
      {
        Status: asString(record.lastStatus, 'unknown'),
        Message: asString(record.lastMessage),
        LastScheduled: formatCalendarDateTime(record.lastScheduledAt),
        Events: statistics.eventsCreated ?? '',
        Habits: statistics.habitsScheduled ?? '',
        Tasks: statistics.tasksScheduled ?? '',
        ActiveHabits: schedulableItems.activeHabits ?? '',
        AutoTasks: schedulableItems.autoScheduleTasks ?? '',
      },
    ]);
    return;
  }

  if (record.defaultSource && Array.isArray(record.options)) {
    process.stdout.write(`${color.bold('Default source')}\n`);
    renderTable(calendarRows([record.defaultSource], resource));
    process.stdout.write(`${color.bold('Options')}\n`);
    renderTable(calendarRows(record.options, resource));
    return;
  }

  if (record.message && Object.keys(record).length <= 4) {
    process.stdout.write(`${asString(record.message)}\n`);
    return;
  }

  renderTable(calendarRows(data, resource));
}

function getTaskRows(tasks: unknown[]) {
  return sortTasksForCli(tasks).map((task) => {
    const record = asRecord(task);
    return {
      Key: getTaskKey(task),
      Title: asString(record.name, 'Untitled task'),
      List: getTaskListName(task),
      Board: getTaskBoardName(task),
      Status: getTaskStatus(task),
      Priority: asString(record.priority),
      Due: formatDueDate(record.end_date),
      __ListColor: getTaskListColor(task),
    };
  });
}

function getPaginationText(record: RenderableRecord) {
  const pagination = asRecord(record.pagination);
  const total =
    typeof pagination.total === 'number'
      ? pagination.total
      : typeof record.count === 'number'
        ? record.count
        : undefined;

  if (typeof total !== 'number') return null;

  const page = pagination.page;
  const pageCount = pagination.pageCount;

  if (typeof page === 'number' && typeof pageCount === 'number') {
    return `Page ${page}/${pageCount} | ${total} total`;
  }

  return `${total} total`;
}

function renderTaskPagination(record: RenderableRecord) {
  const paginationText = getPaginationText(record);
  if (paginationText) {
    process.stdout.write(`${color.dim(paginationText)}\n`);
  }
}

function renderTasks(data: unknown, options: RenderOptions) {
  const record = asRecord(data);
  const task = record.task;
  const tasks = task ? [task] : asArray(record.tasks);

  if (tasks.length === 0 && record.message) {
    process.stdout.write(`${asString(record.message)}\n`);
    return;
  }

  if (options.compact) {
    renderTable(
      sortTasksForCli(tasks).map((task) => ({
        Title: asString(asRecord(task).name, 'Untitled task'),
        List: getTaskListName(task),
        Workspace: getTaskWorkspaceName(
          task,
          options.workspaceName || options.currentWorkspaceId || ''
        ),
        __ListColor: getTaskListColor(task),
      })),
      {
        styleCell: ({ column, row, value }) => {
          if (column === 'List') {
            return formatListName(value, asString(row.__ListColor));
          }
          return column === 'Workspace' ? color.cyan(value) : value;
        },
      }
    );
    renderTaskPagination(record);
    return;
  }

  renderTable(getTaskRows(tasks), { styleCell: styleTaskCell });
  renderTaskPagination(record);
}

export function renderWhoami(data: unknown, json = false) {
  if (json) {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    return;
  }

  const record = asRecord(data);
  const user = asRecord(record.user);
  const currentWorkspace = asRecord(record.currentWorkspace);
  const defaultWorkspace = asRecord(record.defaultWorkspace);
  const userEmail = asTerminalString(user.email, 'unknown');
  const currentWorkspaceId = asTerminalString(currentWorkspace.id);
  const defaultWorkspaceId = asTerminalString(defaultWorkspace.id);

  process.stdout.write(
    `${[
      color.bold(color.cyan('Tuturuuu CLI')),
      `Status: ${
        record.loggedIn
          ? color.green('logged in')
          : color.yellow('not logged in')
      }`,
      `User: ${color.bold(asTerminalString(user.display_name, userEmail))}`,
      `Email: ${color.cyan(userEmail)}`,
      `User ID: ${color.dim(asTerminalString(user.id, 'unknown'))}`,
      `Base URL: ${color.cyan(asTerminalString(record.baseUrl))}`,
      `Config: ${color.dim(asTerminalString(record.configPath))}`,
      `Current workspace: ${color.bold(asTerminalString(currentWorkspace.name, 'none'))}${currentWorkspace.id ? color.dim(` (${currentWorkspaceId})`) : ''}`,
      `Current board: ${color.dim(asTerminalString(record.currentBoardId, 'none'))}`,
      `Current list: ${color.dim(asTerminalString(record.currentListId, 'none'))}`,
      `Current task: ${color.dim(asTerminalString(record.currentTaskId, 'none'))}`,
      `Current label: ${color.dim(asTerminalString(record.currentLabelId, 'none'))}`,
      `Current project: ${color.dim(asTerminalString(record.currentProjectId, 'none'))}`,
      `Default workspace: ${color.bold(asTerminalString(defaultWorkspace.name, 'none'))}${defaultWorkspace.id ? color.dim(` (${defaultWorkspaceId})`) : ''}`,
      `Session: ${color.magenta(asTerminalString(record.session, 'none'))}`,
    ].join('\n')}\n`
  );
}

export function render(data: unknown, options: RenderOptions = {}) {
  if (options.json) {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    return;
  }

  switch (options.group) {
    case 'workspaces':
      renderWorkspaces(data, options.currentWorkspaceId);
      return;
    case 'boards':
      renderBoards(data);
      return;
    case 'lists':
      renderLists(data);
      return;
    case 'tasks':
      renderTasks(data, options);
      return;
    case 'labels':
      renderLabels(data);
      return;
    case 'projects':
      renderProjects(data);
      return;
    case 'finance':
      renderFinance(data, options.financeResource);
      return;
    case 'calendar':
      renderCalendar(data, options.calendarResource);
      return;
    default:
      break;
  }

  if (Array.isArray(data)) {
    renderTable(data.map(asRecord));
    return;
  }

  process.stdout.write(`${inspect(data, { colors: true, depth: 6 })}\n`);
}
