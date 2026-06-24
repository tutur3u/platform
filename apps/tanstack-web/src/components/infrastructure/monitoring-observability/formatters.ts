export function formatCompactNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return '-';
  }

  return new Intl.NumberFormat(undefined, { notation: 'compact' }).format(
    value
  );
}

export function formatPercent(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return '-';
  }

  return `${formatCompactNumber(value)}%`;
}

export function formatLatencyMs(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return '-';
  }

  if (value < 1000) {
    return `${Math.round(value)}ms`;
  }

  return `${(value / 1000).toFixed(1)}s`;
}

export function formatDateTime(value: number | null | undefined) {
  if (!value) {
    return '-';
  }

  return new Intl.DateTimeFormat(undefined, {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
  }).format(value);
}

export function formatBytes(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) {
    return '-';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = Math.abs(value);
  let index = 0;

  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }

  const signed = value < 0 ? -size : size;
  const digits = index === 0 ? 0 : 1;

  return `${signed.toFixed(digits)} ${units[index]}`;
}

export function formatClientContext({
  ipAddress,
  userAgent,
}: {
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  return [ipAddress, userAgent].filter(Boolean).join(' · ');
}

export function formatUserContext({
  userEmail,
  userId,
}: {
  userEmail?: string | null;
  userId?: string | null;
}) {
  return userEmail ?? userId ?? '';
}

export function statusClass(status: number | null | undefined) {
  if (status == null) {
    return 'text-muted-foreground';
  }

  if (status >= 500) {
    return 'text-dynamic-red';
  }

  if (status >= 400) {
    return 'text-dynamic-orange';
  }

  if (status >= 300) {
    return 'text-dynamic-blue';
  }

  return 'text-dynamic-green';
}
