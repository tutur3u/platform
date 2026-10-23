import { CAPACITY_COOLDOWN_MS } from './capacity';
import {
  MAX_FUTURE_OBSERVATION_SKEW_MS,
  usageLimitReceiptActive,
} from './failure-receipt';
import { recordFutureQuarantine } from './future-quarantine';
import type { HookLedger } from './hooks-types';
import { processState } from './process-identity';

const RETENTION = 30 * 86400_000;
export const RESERVATION_TTL = 30 * 60_000;
export function isReservationActive(
  reservation: HookLedger['reservations'][number],
  now: Date,
  activeIds: string[] = []
) {
  const createdAt = Date.parse(reservation.createdAt);
  if (
    !Number.isFinite(createdAt) ||
    createdAt > now.getTime() + MAX_FUTURE_OBSERVATION_SKEW_MS
  )
    return false;
  if (
    reservation.nativeReservationId &&
    activeIds.includes(reservation.nativeReservationId)
  )
    return true;
  const maxExpiry = createdAt + RESERVATION_TTL;
  const expiry = reservation.expiresAt
    ? Math.min(Date.parse(reservation.expiresAt), maxExpiry)
    : maxExpiry;
  return Number.isFinite(expiry) && expiry > now.getTime();
}
export function pruneLedger(
  ledger: HookLedger,
  now: Date,
  activeIds: string[] = []
) {
  const time = now.getTime();
  ledger.retiredRequests ??= [];
  ledger.futureQuarantines ??= {};
  for (const [accountKey, value] of Object.entries(ledger.futureQuarantines)) {
    const quarantinedAt =
      typeof value === 'string' ? value : value.quarantinedAt;
    const timestamp = Date.parse(quarantinedAt);
    const receiptAt =
      typeof value === 'string'
        ? Number.NaN
        : Date.parse(value.latestReceiptAt ?? '');
    if (
      !Number.isFinite(timestamp) ||
      timestamp > time + MAX_FUTURE_OBSERVATION_SKEW_MS ||
      (time - timestamp > RETENTION &&
        (!Number.isFinite(receiptAt) ||
          receiptAt <= time + MAX_FUTURE_OBSERVATION_SKEW_MS))
    )
      delete ledger.futureQuarantines[accountKey];
  }
  ledger.reservations = ledger.reservations.filter((reservation) => {
    const createdAt = Date.parse(reservation.createdAt);
    if (
      reservation.expiresAt &&
      Number.isFinite(createdAt) &&
      Date.parse(reservation.expiresAt) > createdAt + RESERVATION_TTL
    )
      reservation.expiresAt = new Date(
        createdAt + RESERVATION_TTL
      ).toISOString();
    if (isReservationActive(reservation, now, activeIds)) return true;
    ledger.retiredRequests?.push({
      requestId: reservation.requestId,
      retiredAt: now.toISOString(),
    });
    return false;
  });
  ledger.observations = ledger.observations.filter((event) => {
    const observedAt = Date.parse(event.observedAt);
    if (
      !Number.isFinite(observedAt) ||
      observedAt > time + MAX_FUTURE_OBSERVATION_SKEW_MS
    ) {
      if (
        !event.clearedAt &&
        Number.isFinite(observedAt) &&
        observedAt > time + MAX_FUTURE_OBSERVATION_SKEW_MS &&
        (event.outcome === 'usage-limit' || event.outcome === 'capacity-error')
      )
        recordFutureQuarantine(ledger, event.accountKey, now, {
          observedAt: event.observedAt,
          model: event.model,
        });
      return false;
    }
    if (event.clearedAt) return time - Date.parse(event.clearedAt) <= RETENTION;
    const expired =
      event.outcome === 'usage-limit'
        ? !usageLimitReceiptActive(event, now)
        : event.outcome === 'capacity-error'
          ? event.nextEligibleAt
            ? time >= Date.parse(event.nextEligibleAt)
            : time - Date.parse(event.observedAt) >= CAPACITY_COOLDOWN_MS
          : time - Date.parse(event.observedAt) > RETENTION;
    if (!expired) return true;
    if (event.requestId)
      ledger.retiredRequests?.push({
        requestId: event.requestId,
        retiredAt: now.toISOString(),
      });
    return false;
  });
  for (const [instanceId, lastAdmission] of Object.entries(
    ledger.lastAdmissions ?? {}
  ))
    if (lastAdmission > time + MAX_FUTURE_OBSERVATION_SKEW_MS)
      delete ledger.lastAdmissions?.[instanceId];
  ledger.leases = ledger.leases.filter((lease) => {
    if (
      Date.parse(lease.expiresAt) > time ||
      ['same', 'unknown'].includes(
        processState(lease.pid, lease.processStartedAt)
      )
    )
      return true;
    ledger.leaseHistory.push({ action: 'expired', at: lease.expiresAt, lease });
    return false;
  });
  ledger.leaseHistory = ledger.leaseHistory.filter(
    (event) => time - Date.parse(event.at) <= RETENTION
  );
  ledger.retiredRequests = [
    ...new Map(
      ledger.retiredRequests
        .filter((event) => time - Date.parse(event.retiredAt) <= RETENTION)
        .sort((a, b) => Date.parse(a.retiredAt) - Date.parse(b.retiredAt))
        .map((event) => [event.requestId, event])
    ).values(),
  ];
}
