export interface RoomUsage {
  startedAt: string;
  receivedBytes: number;
  reports: Record<
    string,
    { bytes: number; deviceId: string; updatedAt: string }
  >;
  devices: Record<string, true>;
  webSocketMessages: number;
  httpRequests: number;
  storageWrites: number;
}
export function createRoomUsage(): RoomUsage {
  return {
    startedAt: new Date().toISOString(),
    receivedBytes: 0,
    reports: {},
    devices: {},
    webSocketMessages: 0,
    httpRequests: 0,
    storageWrites: 0,
  };
}
export function applyUsageReport(
  usage: RoomUsage,
  deviceId: string,
  reportId: string,
  bytes: number,
  now: string
): RoomUsage {
  const key = `${deviceId}:${reportId}`,
    previous = usage.reports[key]?.bytes ?? 0;
  if (usage.reports[key] && bytes <= previous) return usage;
  if (!usage.reports[key] && Object.keys(usage.reports).length >= 512)
    return usage;
  // Bound per-room telemetry storage. Keep the historical total when a stale report ages out.
  const reports = {
    ...usage.reports,
    [key]: { bytes, deviceId, updatedAt: now },
  };
  return {
    ...usage,
    receivedBytes: usage.receivedBytes + bytes - previous,
    reports,
  };
}
export function summarizeRoomUsage(usage: RoomUsage | undefined) {
  if (!usage) return null;
  const reported = new Set(
    Object.values(usage.reports).map((report) => report.deviceId)
  );
  // List prices, before account-wide allowances. TURN-to-SFU is not double charged.
  return {
    startedAt: usage.startedAt,
    receivedBytes: usage.receivedBytes,
    devices: Object.keys(usage.devices).length,
    reportingDevices: reported.size,
    webSocketMessages: usage.webSocketMessages,
    httpRequests: usage.httpRequests,
    storageWrites: usage.storageWrites,
    sfuEgressUsd: (usage.receivedBytes / 1_000_000_000) * 0.05,
    durableRequestsUsd:
      ((usage.httpRequests + usage.webSocketMessages / 20) / 1_000_000) * 0.15,
    pricingDate: '2026-09-08',
    currency: 'USD',
    basis: 'client-reported RTP payload and server request counters',
    complete: false,
  };
}
