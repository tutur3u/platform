import type { DevboxAdminRunner } from '@/lib/devboxes/admin-store';

export type DevboxTone = 'amber' | 'blue' | 'green' | 'muted' | 'red';

export const devboxToneClasses: Record<
  DevboxTone,
  { border: string; dot: string; soft: string; text: string }
> = {
  amber: {
    border: 'border-dynamic-yellow/40',
    dot: 'bg-dynamic-yellow',
    soft: 'border-dynamic-yellow/30 bg-dynamic-yellow/10',
    text: 'text-dynamic-yellow',
  },
  blue: {
    border: 'border-dynamic-blue/40',
    dot: 'bg-dynamic-blue',
    soft: 'border-dynamic-blue/30 bg-dynamic-blue/10',
    text: 'text-dynamic-blue',
  },
  green: {
    border: 'border-dynamic-green/40',
    dot: 'bg-dynamic-green',
    soft: 'border-dynamic-green/30 bg-dynamic-green/10',
    text: 'text-dynamic-green',
  },
  muted: {
    border: 'border-border',
    dot: 'bg-muted-foreground',
    soft: 'border-border bg-muted/30',
    text: 'text-muted-foreground',
  },
  red: {
    border: 'border-dynamic-red/40',
    dot: 'bg-dynamic-red',
    soft: 'border-dynamic-red/30 bg-dynamic-red/10',
    text: 'text-dynamic-red',
  },
};

export const ONLINE_HEARTBEAT_MS = 2 * 60 * 1000;
export const STALE_HEARTBEAT_MS = 15 * 60 * 1000;

export function formatDateTime(value?: string | null) {
  if (!value) return '-';

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(new Date(value));
}

export function formatRelativeAge(value: string | null | undefined, now: Date) {
  if (!value) return '-';

  const deltaMs = Math.max(now.getTime() - new Date(value).getTime(), 0);
  const seconds = Math.floor(deltaMs / 1000);
  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h`;

  const days = Math.floor(hours / 24);
  return `${days}d`;
}

export function formatDuration(start?: string | null, end?: string | null) {
  if (!start) return '-';

  const endTime = end ? new Date(end).getTime() : Date.now();
  const seconds = Math.max(
    Math.round((endTime - new Date(start).getTime()) / 1000),
    0
  );

  if (seconds < 60) return `${seconds}s`;

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`;

  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function commandLabel(command: string[]) {
  return command.length ? command.join(' ') : '-';
}

export function getRunTone(status: string): DevboxTone {
  if (status === 'succeeded') return 'green';
  if (status === 'running') return 'blue';
  if (status === 'queued') return 'amber';
  if (status === 'failed' || status === 'cancelled' || status === 'timed_out') {
    return 'red';
  }

  return 'muted';
}

export function getRunnerTokenCounts(
  runnerId: string,
  tokens: Array<{ revoked_at: string | null; runner_id: string }>
) {
  const matching = tokens.filter((token) => token.runner_id === runnerId);

  return {
    active: matching.filter((token) => !token.revoked_at).length,
    total: matching.length,
  };
}

export function getRunnerHealth(runner: DevboxAdminRunner, now: Date) {
  if (runner.status === 'revoked') {
    return {
      key: 'revoked',
      tone: 'muted' as const,
    };
  }

  if (!runner.last_heartbeat_at) {
    return {
      key: 'never_seen',
      tone: 'amber' as const,
    };
  }

  const heartbeatAge =
    now.getTime() - new Date(runner.last_heartbeat_at).getTime();

  if (heartbeatAge <= ONLINE_HEARTBEAT_MS && runner.status === 'online') {
    return {
      key: 'online',
      tone: 'green' as const,
    };
  }

  if (heartbeatAge > STALE_HEARTBEAT_MS) {
    return {
      key: 'stale',
      tone: 'red' as const,
    };
  }

  return {
    key: 'warming',
    tone: 'blue' as const,
  };
}
