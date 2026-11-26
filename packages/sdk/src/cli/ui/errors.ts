import { CliError } from '../cli-contracts';
import { escapeTerminalText } from '../select';
import { createTheme } from './theme';

export interface FormatCliErrorOptions {
  json?: boolean;
  noColor?: boolean;
}

export interface EmitCliErrorOptions extends FormatCliErrorOptions {
  writeErr?: (chunk: string) => void;
  writeOut?: (chunk: string) => void;
}

export interface FormattedCliError {
  exitCode: number;
  output: string;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function formatCliError(
  error: unknown,
  options: FormatCliErrorOptions = {}
): FormattedCliError {
  const cli = error instanceof CliError ? error : null;
  const exitCode = cli?.exitCode ?? 1;
  const message = cli?.message ?? errorMessage(error);

  if (options.json) {
    const body: {
      code: string;
      hint?: string;
      message: string;
      requestId?: string;
    } = {
      code: cli?.code ?? 'INTERNAL',
      message,
    };
    if (cli?.hint) body.hint = cli.hint;
    if (cli?.requestId) body.requestId = cli.requestId;
    return {
      exitCode,
      output: `${JSON.stringify({ ok: false, error: body })}\n`,
    };
  }

  const theme = createTheme({ noColor: options.noColor });
  const lines = [`${theme.err('error:')} ${escapeTerminalText(message)}`];
  if (cli) {
    lines.push(`${theme.dim('code:')} ${escapeTerminalText(cli.code)}`);
    if (cli.hint) {
      lines.push(`${theme.dim('hint:')} ${escapeTerminalText(cli.hint)}`);
    }
    if (cli.requestId) {
      lines.push(
        `${theme.dim('request:')} ${escapeTerminalText(cli.requestId)}`
      );
    }
    if (cli.docsUrl) {
      lines.push(`${theme.dim('docs:')} ${escapeTerminalText(cli.docsUrl)}`);
    }
  }

  return { exitCode, output: `${lines.join('\n')}\n` };
}

export function emitCliError(
  error: unknown,
  options: EmitCliErrorOptions = {}
): number {
  const formatted = formatCliError(error, options);
  const writeErr =
    options.writeErr ??
    ((chunk: string) => {
      process.stderr.write(chunk);
    });
  // JSON and human errors both go to stderr so stdout stays machine-readable.
  writeErr(formatted.output);
  return formatted.exitCode;
}
