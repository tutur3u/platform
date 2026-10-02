import reserved from './username-policy.json';

export const USERNAME_MIN_LENGTH = 5;
export const USERNAME_MAX_LENGTH = 32;
export const USERNAME_CHANGE_INTERVAL_DAYS = 14;
export const DISPLAY_NAME_CHANGE_LIMIT = 2;
export const DISPLAY_NAME_CHANGE_WINDOW_DAYS = 7;
const common = new Set(reserved.common);
const brandPatterns = reserved.brands.map(
  (brand) =>
    new RegExp(`^(official)?${brand}(official|support|admin|team|[0-9]+)?$`)
);
export function isReservedUsername(value: string) {
  const normalized = value.toLowerCase().replaceAll('_', '');
  return (
    common.has(normalized) ||
    brandPatterns.some((pattern) => pattern.test(normalized))
  );
}
export function isValidNewUsername(value: string) {
  return /^[a-z0-9][a-z0-9_]{4,31}$/.test(value) && !isReservedUsername(value);
}
