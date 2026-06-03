export interface SelectItemOptions<T> {
  defaultIndex?: number;
  getBadge?: (item: T) => string | undefined;
  getDescription?: (item: T) => string | undefined;
  getLabel: (item: T) => string;
  items: T[];
  title: string;
}

type ColorCode = 1 | 2 | 22 | 31 | 32 | 33 | 34 | 35 | 36 | 90;
type RenderSelectItemLinesOptions<T> = Pick<
  SelectItemOptions<T>,
  'getBadge' | 'getDescription' | 'getLabel' | 'items' | 'title'
> & {
  selectedIndex: number;
};

const NAMED_CONTROL_ESCAPES = new Map<string, string>([
  ['\b', '\\b'],
  ['\t', '\\t'],
  ['\n', '\\n'],
  ['\v', '\\v'],
  ['\f', '\\f'],
  ['\r', '\\r'],
]);

function supportsColor() {
  return (
    process.stderr.isTTY &&
    process.env.NO_COLOR === undefined &&
    process.env.TERM !== 'dumb'
  );
}

function colorize(code: ColorCode, value: string) {
  return supportsColor() ? `\x1b[${code}m${value}\x1b[0m` : value;
}

export function escapeTerminalText(value: string) {
  let escaped = '';

  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;

    if (
      !(
        (codePoint >= 0x00 && codePoint <= 0x1f) ||
        (codePoint >= 0x7f && codePoint <= 0x9f)
      )
    ) {
      escaped += character;
      continue;
    }

    const named = NAMED_CONTROL_ESCAPES.get(character);
    if (named) {
      escaped += named;
      continue;
    }

    escaped += `\\x${codePoint.toString(16).toUpperCase().padStart(2, '0')}`;
  }

  return escaped;
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

function colorizeHexOrName(value: string, colorValue: string) {
  return /^#?[a-f\d]{6}$/i.test(colorValue.trim())
    ? colorizeHex(value, colorValue)
    : colorize(getNamedColorCode(colorValue), value);
}

export const color = {
  blue: (value: string) => colorize(34, value),
  bold: (value: string) => colorize(1, value),
  cyan: (value: string) => colorize(36, value),
  dim: (value: string) => colorize(2, value),
  green: (value: string) => colorize(32, value),
  hexOrName: colorizeHexOrName,
  magenta: (value: string) => colorize(35, value),
  red: (value: string) => colorize(31, value),
  yellow: (value: string) => colorize(33, value),
};

function clampIndex(index: number, length: number) {
  return Math.max(0, Math.min(index, Math.max(0, length - 1)));
}

function isRawModeCapable(
  stream: NodeJS.ReadStream
): stream is NodeJS.ReadStream & { setRawMode: (mode: boolean) => void } {
  return typeof stream.setRawMode === 'function';
}

export function renderSelectItemLines<T>({
  getBadge,
  getDescription,
  getLabel,
  items,
  selectedIndex,
  title,
}: RenderSelectItemLinesOptions<T>) {
  const indexWidth = String(items.length).length;

  return [
    color.bold(color.cyan(title)),
    color.dim(
      'Use up/down or j/k to move, space/enter to select, q/esc to cancel.'
    ),
    '',
    ...items.map((item, index) => {
      const selected = index === selectedIndex;
      const prefix = selected ? color.green('>') : ' ';
      const itemIndex = color.cyan(
        `${String(index + 1).padStart(indexWidth, ' ')}.`
      );
      const badge = getBadge?.(item);
      const safeLabel = escapeTerminalText(getLabel(item));
      const label = selected ? color.bold(safeLabel) : safeLabel;
      const description = getDescription?.(item);
      return [
        `${prefix} ${itemIndex}`,
        badge,
        label,
        description ? color.dim(escapeTerminalText(description)) : '',
      ]
        .filter(Boolean)
        .join(' ');
    }),
  ];
}

export async function selectItem<T>({
  defaultIndex = 0,
  getBadge,
  getDescription,
  getLabel,
  items,
  title,
}: SelectItemOptions<T>) {
  if (items.length === 0) {
    throw new Error('Nothing to select.');
  }

  if (!process.stdin.isTTY || !process.stderr.isTTY) {
    throw new Error(
      'Interactive selection requires a TTY. Pass an explicit id.'
    );
  }

  if (!isRawModeCapable(process.stdin)) {
    throw new Error('Interactive selection is not supported in this terminal.');
  }

  let selectedIndex = clampIndex(defaultIndex, items.length);
  let renderedLines = 0;

  return new Promise<T>((resolve, reject) => {
    const write = (value: string) => process.stderr.write(value);

    const cleanup = () => {
      process.stdin.off('data', onData);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      write('\x1b[?25h');
    };

    const render = () => {
      if (renderedLines > 0) {
        write(`\x1b[${renderedLines}F`);
      }
      write('\x1b[J\x1b[?25l');

      const lines = renderSelectItemLines({
        getBadge,
        getDescription,
        getLabel,
        items,
        selectedIndex,
        title,
      });

      renderedLines = lines.length;
      write(`${lines.join('\n')}\n`);
    };

    function rejectSelection(error: Error) {
      cleanup();
      reject(error);
    }

    function resolveSelection() {
      const selected = items[selectedIndex];
      if (!selected) {
        rejectSelection(new Error('No item selected.'));
        return;
      }

      cleanup();
      process.stderr.write('\n');
      resolve(selected);
    }

    function onData(data: Buffer) {
      const input = data.toString('utf8');

      if (input === '\u0003') {
        rejectSelection(new Error('Selection cancelled.'));
        return;
      }

      if (input === '\r' || input === '\n' || input === ' ') {
        resolveSelection();
        return;
      }

      if (input === '\u001b' || input === 'q') {
        rejectSelection(new Error('Selection cancelled.'));
        return;
      }

      if (input === '\u001b[A' || input === 'k') {
        selectedIndex =
          selectedIndex <= 0 ? items.length - 1 : selectedIndex - 1;
        render();
        return;
      }

      if (input === '\u001b[B' || input === 'j') {
        selectedIndex =
          selectedIndex >= items.length - 1 ? 0 : selectedIndex + 1;
        render();
      }
    }

    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', onData);
    render();
  });
}
