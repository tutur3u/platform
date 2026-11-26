import type { MutationPreview } from '../cli-contracts';
import { escapeTerminalText } from '../select';
import { createTheme } from './theme';

export interface FormatMutationPreviewOptions {
  json?: boolean;
  noColor?: boolean;
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return escapeTerminalText(value);
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return escapeTerminalText(String(value));
  }

  try {
    return escapeTerminalText(JSON.stringify(value) ?? 'undefined');
  } catch {
    return escapeTerminalText(String(value));
  }
}

export function formatMutationPreview(
  preview: MutationPreview,
  options: FormatMutationPreviewOptions = {}
): string {
  if (options.json) {
    return `${JSON.stringify({ applied: false, preview }, null, 2)}\n`;
  }

  const theme = createTheme({ noColor: options.noColor });
  const lines: string[] = [];

  if (preview.env === 'prod') {
    lines.push(theme.badge('ENV: PROD', 'prod'));
    lines.push(
      theme.err('Production target. Review this diff before you apply it.')
    );
  } else {
    lines.push(theme.badge(`ENV: ${preview.env.toUpperCase()}`, 'muted'));
  }

  lines.push(theme.bold(escapeTerminalText(preview.title)));
  lines.push(`Target: ${escapeTerminalText(preview.target)}`);
  lines.push(`Origin: ${escapeTerminalText(preview.origin)}`);
  lines.push(
    `Tier: ${theme.badge(
      preview.tier === 2 ? 'TIER 2' : 'TIER 1',
      preview.tier === 2 ? 'warn' : 'info'
    )}`
  );
  lines.push('');

  if (preview.changes.length === 0) {
    lines.push(theme.dim('No field changes.'));
  } else {
    for (const change of preview.changes) {
      lines.push(theme.bold(escapeTerminalText(change.field)));
      if ('before' in change) {
        lines.push(theme.red(`- ${formatValue(change.before)}`));
      }
      if ('after' in change) {
        lines.push(theme.green(`+ ${formatValue(change.after)}`));
      }
    }
  }

  lines.push('');
  lines.push(preview.applyHint);

  if (preview.tier === 2) {
    if (preview.confirmToken) {
      lines.push(`Confirm token: ${escapeTerminalText(preview.confirmToken)}`);
    }
    lines.push('Pass the confirm token before applying this tier 2 change.');
  }

  return `${lines.join('\n')}\n`;
}
