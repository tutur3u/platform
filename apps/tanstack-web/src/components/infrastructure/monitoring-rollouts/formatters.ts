'use client';

const DEPLOYMENT_STATUS_TRANSLATION_KEYS = {
  active: 'deployment_status.active',
  building: 'deployment_status.building',
  canceled: 'deployment_status.canceled',
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

export function formatCompactNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return '0';
  }

  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: value >= 100 ? 0 : 1,
    notation: 'compact',
  }).format(value);
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
  ].filter((part): part is string => Boolean(part));

  return parts.slice(0, 2).join(' ');
}

function parseTime(value: number | string | null | undefined) {
  if (value == null) {
    return Number.NaN;
  }

  return typeof value === 'number' ? value : Date.parse(value);
}

export function formatClockTime(value: number | string | null | undefined) {
  const time = parseTime(value);

  if (!Number.isFinite(time)) {
    return '-';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(time);
}

export function formatDateTime(value: number | string | null | undefined) {
  const time = parseTime(value);

  if (!Number.isFinite(time)) {
    return '-';
  }

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(time);
}

export function formatRelativeTime(value: number | string | null | undefined) {
  const time = parseTime(value);

  if (!Number.isFinite(time)) {
    return '-';
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

  return '-';
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
