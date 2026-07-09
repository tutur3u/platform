export function truthy(value: string | null | undefined) {
  const normalized = value?.trim().toLowerCase();
  return (
    normalized === '1' ||
    normalized === 'true' ||
    normalized === 'yes' ||
    normalized === 'on'
  );
}

export function toDisplayName(user: {
  display_name?: string | null;
  email?: string | null;
  full_name?: string | null;
}) {
  return user.display_name || user.full_name || user.email || null;
}

export function toDateKey(value = new Date()) {
  return value.toISOString().slice(0, 10);
}

export function getYesterdayKey() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - 1);
  return toDateKey(date);
}

export function firstOf<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
