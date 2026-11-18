import { EyeOff, Shield, UserRound } from '@tuturuuu/icons/lucide';
import { Badge } from '@tuturuuu/ui/badge';
import type { PollCountdownState } from '../lib/poll-countdown';

export function PollLiveDot() {
  return (
    <span aria-hidden="true" className="relative inline-flex size-2 shrink-0">
      <span className="absolute inset-0 animate-ping rounded-full bg-dynamic-green opacity-50 motion-reduce:animate-none motion-reduce:opacity-0" />
      <span className="relative size-full rounded-full bg-dynamic-green" />
    </span>
  );
}

export interface PollCountdownPillProps {
  state: PollCountdownState;
  label?: string;
}

export function PollCountdownPill({ state, label }: PollCountdownPillProps) {
  return (
    <Badge
      role="timer"
      variant="outline"
      className={
        state.isUrgent
          ? 'min-w-0 shrink rounded-full border-destructive/40 bg-accent wrap-anywhere whitespace-normal text-destructive tabular-nums'
          : 'min-w-0 shrink rounded-full bg-muted wrap-anywhere whitespace-normal text-foreground tabular-nums'
      }
    >
      {label ?? state.formatted}
    </Badge>
  );
}

const indicatorIcons = {
  anonymous: Shield,
  named: UserRound,
  'results-hidden': EyeOff,
};

export interface PollIndicatorPillProps {
  kind: keyof typeof indicatorIcons;
  label: string;
}

export function PollIndicatorPill({ kind, label }: PollIndicatorPillProps) {
  const Icon = indicatorIcons[kind];

  return (
    <Badge
      variant="secondary"
      className="min-w-0 shrink rounded-full wrap-anywhere whitespace-normal"
    >
      <Icon aria-hidden="true" className="shrink-0" />
      {label}
    </Badge>
  );
}
