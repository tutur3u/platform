import {
  Ban,
  Check,
  Eye,
  Info,
  type LucideIcon,
  Pause,
  Play,
  RefreshCw,
  TriangleAlert,
} from '@tuturuuu/icons';
import { cn } from '@tuturuuu/utils/format';

/** The fleet:v1 card-schema statuses, plus `unknown` for missing telemetry. */
export type FleetStatusValue =
  | 'needs_user'
  | 'running'
  | 'waiting_review'
  | 'waiting_ci'
  | 'blocked'
  | 'queued'
  | 'done'
  | 'unknown';

const STATUS_STYLE: Record<
  FleetStatusValue,
  { icon: LucideIcon; className: string; quiet?: boolean }
> = {
  needs_user: {
    icon: TriangleAlert,
    className: 'bg-dynamic-yellow/15 text-dynamic-yellow',
  },
  running: { icon: Play, className: 'bg-dynamic-blue/15 text-dynamic-blue' },
  waiting_review: {
    icon: Eye,
    className: 'bg-dynamic-purple/15 text-dynamic-purple',
  },
  waiting_ci: {
    icon: RefreshCw,
    className: 'bg-dynamic-cyan/15 text-dynamic-cyan',
  },
  blocked: { icon: Ban, className: 'bg-dynamic-red/15 text-dynamic-red' },
  queued: {
    icon: Pause,
    className: 'bg-muted text-muted-foreground',
    quiet: true,
  },
  done: { icon: Check, className: 'bg-dynamic-green/15 text-dynamic-green' },
  unknown: {
    icon: Info,
    className: 'bg-muted text-muted-foreground',
    quiet: true,
  },
};

export interface FleetStatusChipProps {
  status: FleetStatusValue;
  /** The localized status word; colour is never the only signal. */
  label: string;
  className?: string;
}

/** A fleet task's live state: a word, an icon and a tone. Queued and unknown stay quiet. */
export function FleetStatusChip({
  status,
  label,
  className,
}: FleetStatusChipProps) {
  const style = STATUS_STYLE[status] ?? STATUS_STYLE.unknown;
  const Icon = style.icon;
  return (
    <span
      className={cn(
        'inline-flex h-5 w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 font-semibold text-[11.5px] leading-none',
        style.className,
        className
      )}
      data-status={status}
    >
      {style.quiet ? (
        <span
          aria-hidden
          className="size-1.5 rounded-full bg-muted-foreground"
        />
      ) : (
        <Icon aria-hidden className="size-3" />
      )}
      {label}
    </span>
  );
}
