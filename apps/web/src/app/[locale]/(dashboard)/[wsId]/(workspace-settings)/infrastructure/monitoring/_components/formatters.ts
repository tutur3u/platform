'use client';

const COLOR_TRANSLATION_KEYS = {
  blue: 'colors.blue',
  green: 'colors.green',
} as const;

const DEPLOYMENT_STATUS_TRANSLATION_KEYS = {
  active: 'deployment_status.active',
  building: 'deployment_status.building',
  deploying: 'deployment_status.deploying',
  ended: 'deployment_status.ended',
  failed: 'deployment_status.failed',
  successful: 'deployment_status.successful',
  unknown: 'deployment_status.unknown',
} as const;

const RUNTIME_BADGE_TRANSLATION_KEYS = {
  active: 'runtime_badges.active',
  standby: 'runtime_badges.standby',
} as const;

const RUNTIME_STATE_TRANSLATION_KEYS = {
  degraded: 'runtime_states.degraded',
  idle: 'runtime_states.idle',
  serving: 'runtime_states.serving',
  unknown: 'runtime_states.unknown',
} as const;

export function formatNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return '0';
  }

  return new Intl.NumberFormat('en-US').format(Math.round(value));
}

export function formatDecimalNumber(
  value: number | null | undefined,
  {
    maximumFractionDigits = 1,
    minimumFractionDigits = 0,
  }: {
    maximumFractionDigits?: number;
    minimumFractionDigits?: number;
  } = {}
) {
  if (value == null || !Number.isFinite(value)) {
    return '0';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits,
    minimumFractionDigits,
  }).format(value);
}

export function formatCompactNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return '0';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value >= 100 ? 0 : 1,
    notation: 'compact',
  }).format(value);
}

export function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return '0%';
  }

  return `${value.toFixed(value >= 10 ? 0 : 1)}%`;
}

export function formatBytes(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 100 ? 0 : size >= 10 ? 1 : 2)} ${units[unitIndex]}`;
}

export function formatDuration(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value < 0) {
    return '0s';
  }

  if (value < 1000) {
    return '<1s';
  }

  const totalSeconds = Math.floor(value / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts = [
    days > 0 ? `${days}d` : null,
    hours > 0 ? `${hours}h` : null,
    minutes > 0 ? `${minutes}m` : null,
    seconds > 0 ? `${seconds}s` : null,
  ].filter((value): value is string => Boolean(value));

  return parts.slice(0, 2).join(' ');
}

export function formatLatencyMs(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value < 0) {
    return '0 ms';
  }

  if (value >= 1000) {
    return `${formatDecimalNumber(value / 1000, {
      maximumFractionDigits: value >= 10_000 ? 0 : 1,
    })} s`;
  }

  return `${formatDecimalNumber(value, {
    maximumFractionDigits: value >= 100 ? 0 : 1,
  })} ms`;
}

export function formatClockTime(value: number | string | null | undefined) {
  if (value == null) {
    return '—';
  }

  const time =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Date.parse(value)
        : NaN;

  if (!Number.isFinite(time)) {
    return '—';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(time);
}

export function formatDateTime(value: number | string | null | undefined) {
  if (value == null) {
    return '—';
  }

  const time =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Date.parse(value)
        : NaN;

  if (!Number.isFinite(time)) {
    return '—';
  }

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(time);
}

export function formatRelativeTime(value: number | string | null | undefined) {
  if (value == null) {
    return '—';
  }

  const time =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Date.parse(value)
        : NaN;

  if (!Number.isFinite(time)) {
    return '—';
  }

  const diff = time - Date.now();
  const abs = Math.abs(diff);
  const units: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
    ['second', 1000],
  ];

  for (const [unit, size] of units) {
    if (abs >= size || unit === 'second') {
      return new Intl.RelativeTimeFormat(undefined, {
        numeric: 'auto',
      }).format(Math.round(diff / size), unit);
    }
  }

  return '—';
}

export function getColorTranslationKey(value: string | null | undefined) {
  return value && value in COLOR_TRANSLATION_KEYS
    ? COLOR_TRANSLATION_KEYS[value as keyof typeof COLOR_TRANSLATION_KEYS]
    : null;
}

export function getDeploymentStatusTranslationKey(
  value: string | null | undefined
) {
  return value && value in DEPLOYMENT_STATUS_TRANSLATION_KEYS
    ? DEPLOYMENT_STATUS_TRANSLATION_KEYS[
        value as keyof typeof DEPLOYMENT_STATUS_TRANSLATION_KEYS
      ]
    : DEPLOYMENT_STATUS_TRANSLATION_KEYS.unknown;
}

export function getRuntimeBadgeTranslationKey(
  value: string | null | undefined
) {
  return value && value in RUNTIME_BADGE_TRANSLATION_KEYS
    ? RUNTIME_BADGE_TRANSLATION_KEYS[
        value as keyof typeof RUNTIME_BADGE_TRANSLATION_KEYS
      ]
    : null;
}

export function getRuntimeStateTranslationKey(
  value: string | null | undefined
) {
  return value && value in RUNTIME_STATE_TRANSLATION_KEYS
    ? RUNTIME_STATE_TRANSLATION_KEYS[
        value as keyof typeof RUNTIME_STATE_TRANSLATION_KEYS
      ]
    : RUNTIME_STATE_TRANSLATION_KEYS.unknown;
}
