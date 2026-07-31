import { cn } from '@tuturuuu/utils/format';

export type RunStatus =
  | 'aborted'
  | 'failed'
  | 'reserved'
  | 'running'
  | 'succeeded';

const STATUS_CLASSES: Record<RunStatus, string> = {
  aborted: 'bg-dynamic-orange/10 text-dynamic-orange ring-dynamic-orange/25',
  failed: 'bg-dynamic-red/10 text-dynamic-red ring-dynamic-red/25',
  reserved: 'bg-dynamic-purple/10 text-dynamic-purple ring-dynamic-purple/25',
  running: 'bg-dynamic-blue/10 text-dynamic-blue ring-dynamic-blue/25',
  succeeded: 'bg-dynamic-green/10 text-dynamic-green ring-dynamic-green/25',
};

const DOT_CLASSES: Record<RunStatus, string> = {
  aborted: 'bg-dynamic-orange',
  failed: 'bg-dynamic-red',
  reserved: 'bg-dynamic-purple',
  running: 'bg-dynamic-blue',
  succeeded: 'bg-dynamic-green',
};

/**
 * Ledger rows arrive as plain strings, so unknown values fall back to the
 * neutral `reserved` treatment instead of rendering an unstyled pill.
 */
export function normalizeRunStatus(status: string): RunStatus {
  return status in STATUS_CLASSES ? (status as RunStatus) : 'reserved';
}

/**
 * Status is the fastest thing to scan in a run table, so it gets colour while
 * the rest of the row stays monochrome.
 */
export function StatusPill({
  className,
  label,
  status,
}: {
  className?: string;
  label: string;
  status: RunStatus;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium text-xs ring-1 ring-inset',
        STATUS_CLASSES[status],
        className
      )}
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          DOT_CLASSES[status],
          status === 'running' && 'animate-pulse'
        )}
      />
      {label}
    </span>
  );
}
