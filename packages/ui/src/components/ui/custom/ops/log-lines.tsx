import { cn } from '@tuturuuu/utils/format';
import type { ReactNode } from 'react';
import { type OpsTone, opsToneClasses } from './status-tone';

export interface LogLine {
  id: string;
  /** Short source or event type shown before the text, e.g. "stderr". */
  kind?: string;
  text: string;
  time?: string;
  tone?: OpsTone;
}

export interface LogLinesProps {
  className?: string;
  emptyLabel: ReactNode;
  /** Accessible name for the log region. */
  label: string;
  lines: LogLine[];
}

/** Server-rendered, wrap-safe log output. Text is rendered, never parsed. */
export function LogLines({
  className,
  emptyLabel,
  label,
  lines,
}: LogLinesProps) {
  if (lines.length === 0) {
    return (
      <p className={cn('px-4 py-6 text-muted-foreground text-sm', className)}>
        {emptyLabel}
      </p>
    );
  }

  return (
    <ol
      aria-label={label}
      className={cn(
        'max-h-[32rem] overflow-auto bg-foreground/[0.03] py-2 font-mono text-xs leading-5',
        className
      )}
    >
      {lines.map((line) => (
        <li
          className={cn(
            'grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 px-4 sm:grid-cols-[auto_auto_minmax(0,1fr)]',
            line.tone &&
              line.tone !== 'neutral' &&
              opsToneClasses[line.tone].text
          )}
          data-tone={line.tone}
          key={line.id}
        >
          <span className="text-muted-foreground tabular-nums">
            {line.time ?? ''}
          </span>
          <span className="hidden text-muted-foreground sm:inline">
            {line.kind ?? ''}
          </span>
          <span className="whitespace-pre-wrap break-words">{line.text}</span>
        </li>
      ))}
    </ol>
  );
}
