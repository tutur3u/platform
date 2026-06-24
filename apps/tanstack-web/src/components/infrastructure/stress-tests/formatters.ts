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
  ].filter((part): part is string => Boolean(part));

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
    return '-';
  }

  const time =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Date.parse(value)
        : NaN;

  if (!Number.isFinite(time)) {
    return '-';
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(time);
}
