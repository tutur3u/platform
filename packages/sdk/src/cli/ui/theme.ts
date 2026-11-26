export interface ColorOptions {
  env?: NodeJS.ProcessEnv;
  forceColor?: boolean;
  isTTY?: boolean;
  noColor?: boolean;
}

export type BadgeTone = 'err' | 'info' | 'muted' | 'ok' | 'prod' | 'warn';

export interface Theme {
  badge: (label: string, tone: BadgeTone) => string;
  blue: (value: string) => string;
  bold: (value: string) => string;
  cyan: (value: string) => string;
  dim: (value: string) => string;
  err: (value: string) => string;
  green: (value: string) => string;
  info: (value: string) => string;
  magenta: (value: string) => string;
  ok: (value: string) => string;
  red: (value: string) => string;
  stripAnsi: (value: string) => string;
  visibleLength: (value: string) => number;
  warn: (value: string) => string;
  yellow: (value: string) => string;
}

const ANSI_PATTERN =
  /\u001B(?:\[[0-?]*[ -/]*[@-~]|\][\s\S]*?(?:\u0007|\u001B\\)|[@-Z\\-_])/g;

export function stripAnsi(value: string): string {
  return value.replace(ANSI_PATTERN, '');
}

export function visibleLength(value: string): number {
  return [...stripAnsi(value)].length;
}

export function supportsColor(options: ColorOptions = {}): boolean {
  if (options.noColor) return false;
  if (options.forceColor) return true;

  const env = options.env ?? process.env;
  if (env.NO_COLOR !== undefined && env.NO_COLOR !== '') return false;
  if (env.FORCE_COLOR === '0' || env.FORCE_COLOR === 'false') return false;
  if (env.FORCE_COLOR !== undefined && env.FORCE_COLOR !== '') return true;
  if (env.TERM === 'dumb') return false;
  if (options.isTTY !== undefined) return options.isTTY;
  return Boolean(process.stdout.isTTY);
}

export function createTheme(options: ColorOptions = {}): Theme {
  const enabled = supportsColor(options);

  const paint = (code: string, value: string) =>
    enabled ? `\u001B[${code}m${value}\u001B[0m` : value;

  const badge = (label: string, tone: BadgeTone) => {
    const text = `[${label}]`;
    switch (tone) {
      case 'ok':
        return paint('32', text);
      case 'warn':
        return paint('33', text);
      case 'err':
        return paint('31', text);
      case 'info':
        return paint('36', text);
      case 'prod':
        return paint('1;31', text);
      case 'muted':
        return paint('2', text);
      default: {
        const unhandled: never = tone;
        return unhandled;
      }
    }
  };

  return {
    badge,
    blue: (value) => paint('34', value),
    bold: (value) => paint('1', value),
    cyan: (value) => paint('36', value),
    dim: (value) => paint('2', value),
    err: (value) => paint('31', value),
    green: (value) => paint('32', value),
    info: (value) => paint('36', value),
    magenta: (value) => paint('35', value),
    ok: (value) => paint('32', value),
    red: (value) => paint('31', value),
    stripAnsi,
    visibleLength,
    warn: (value) => paint('33', value),
    yellow: (value) => paint('33', value),
  };
}
