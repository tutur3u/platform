import type { HookLedger } from './hooks-types';

export function validLedger(value: unknown): value is HookLedger {
  const record = (item: unknown): item is Record<string, unknown> =>
    Boolean(item && typeof item === 'object' && !Array.isArray(item));
  const text = (item: unknown) =>
    typeof item === 'string' && item.length > 0 && item.length <= 512;
  const date = (item: unknown) =>
    typeof item === 'string' && Number.isFinite(Date.parse(item));
  const optional = (item: unknown, check: (item: unknown) => boolean) =>
    item === undefined || check(item);
  const lease = (item: unknown): boolean =>
    record(item) &&
    ['threadId', 'accountKey', 'attemptId'].every((key) => text(item[key])) &&
    typeof item.pid === 'number' &&
    Number.isInteger(item.pid) &&
    item.pid > 0 &&
    ['processStartedAt', 'acquiredAt', 'expiresAt'].every((key) =>
      date(item[key])
    );
  if (
    !record(value) ||
    value.version !== 1 ||
    !['observations', 'reservations', 'leases', 'leaseHistory'].every((key) =>
      Array.isArray(value[key])
    )
  )
    return false;
  return (
    optional(
      value.poolHolds,
      (item) =>
        record(item) && Object.values(item).every((v) => typeof v === 'boolean')
    ) &&
    optional(
      value.lastAdmissions,
      (item) =>
        record(item) &&
        Object.values(item).every(
          (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0
        )
    ) &&
    optional(
      value.retiredRequests,
      (items) =>
        Array.isArray(items) &&
        items.every(
          (item) => record(item) && text(item.requestId) && date(item.retiredAt)
        )
    ) &&
    (value.observations as unknown[]).every(
      (item) =>
        record(item) &&
        ['eventId', 'instanceId', 'accountKey'].every((key) =>
          text(item[key])
        ) &&
        ['success', 'usage-limit', 'capacity-error'].includes(
          String(item.outcome)
        ) &&
        date(item.observedAt) &&
        optional(item.model, text) &&
        optional(
          item.windowScope,
          (scope) =>
            record(scope) &&
            ['account', 'models', 'unknown'].includes(String(scope.kind)) &&
            (scope.kind !== 'models' ||
              (Array.isArray(scope.modelPrefixes) &&
                scope.modelPrefixes.length > 0 &&
                scope.modelPrefixes.every(text)))
        ) &&
        optional(item.clearedAt, date) &&
        optional(item.resetsAt, date) &&
        optional(item.nextEligibleAt, date) &&
        optional(item.requestId, text) &&
        optional(item.nativeReservationId, text) &&
        optional(item.terminal, (item) => typeof item === 'boolean')
    ) &&
    (value.reservations as unknown[]).every(
      (item) =>
        record(item) &&
        ['requestId', 'threadId', 'instanceId', 'accountKey', 'model'].every(
          (key) => text(item[key])
        ) &&
        date(item.createdAt) &&
        optional(item.nativeReservationId, text)
    ) &&
    (value.leases as unknown[]).every(lease) &&
    (value.leaseHistory as unknown[]).every(
      (item) =>
        record(item) &&
        ['acquire', 'release', 'expired-takeover', 'expired'].includes(
          String(item.action)
        ) &&
        date(item.at) &&
        lease(item.lease)
    )
  );
}
