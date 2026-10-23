import type { AccountReserve } from './types';

const RESERVES_ERROR = 'AGENT_QUOTA_RESERVES must contain valid JSON.';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    isObject(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}

export function parseReserves(
  configured = process.env.AGENT_QUOTA_RESERVES
): Record<string, AccountReserve> {
  if (!configured) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(configured);
  } catch {
    throw new Error(RESERVES_ERROR);
  }
  if (!isPlainObject(parsed)) throw new Error(RESERVES_ERROR);
  for (const reserve of Object.values(parsed)) {
    if (!isPlainObject(reserve)) throw new Error(RESERVES_ERROR);
    const { minRemainingPercent, maxConcurrent, excluded } = reserve;
    if (
      (minRemainingPercent !== undefined &&
        (typeof minRemainingPercent !== 'number' ||
          !Number.isFinite(minRemainingPercent) ||
          minRemainingPercent < 0 ||
          minRemainingPercent > 100)) ||
      (maxConcurrent !== undefined &&
        (typeof maxConcurrent !== 'number' ||
          !Number.isInteger(maxConcurrent) ||
          maxConcurrent < 0)) ||
      (excluded !== undefined && typeof excluded !== 'boolean')
    )
      throw new Error(RESERVES_ERROR);
  }
  return parsed as Record<string, AccountReserve>;
}
