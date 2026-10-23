import type { HookLedger } from './hooks-types';
import { processState } from './process-identity';

const RETENTION = 30 * 86400_000;
export const RESERVATION_TTL = 30 * 60_000;
export function pruneLedger(
  ledger: HookLedger,
  now: Date,
  activeIds: string[] = []
) {
  const time = now.getTime();
  ledger.retiredRequests ??= [];
  ledger.reservations = ledger.reservations.filter((reservation) => {
    if (
      reservation.nativeReservationId &&
      activeIds.includes(reservation.nativeReservationId)
    )
      return true;
    if (time - Date.parse(reservation.createdAt) <= RESERVATION_TTL)
      return true;
    ledger.retiredRequests?.push({
      requestId: reservation.requestId,
      retiredAt: now.toISOString(),
    });
    return false;
  });
  ledger.observations = ledger.observations.filter((event) => {
    if (event.clearedAt) return time - Date.parse(event.clearedAt) <= RETENTION;
    const expired =
      event.outcome === 'usage-limit'
        ? Boolean(event.resetsAt && Date.parse(event.resetsAt) <= time)
        : event.outcome === 'capacity-error'
          ? time - Date.parse(event.observedAt) >= 60_000
          : time - Date.parse(event.observedAt) > RETENTION;
    if (!expired) return true;
    if (event.requestId)
      ledger.retiredRequests?.push({
        requestId: event.requestId,
        retiredAt: now.toISOString(),
      });
    return false;
  });
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
