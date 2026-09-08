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
  httpCounterWrites?: number;
  limitedReports?: number;
  reportedDevices?: Record<string, true>;
  deviceBytes?: Record<string, number>;
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
  const key = `${deviceId}:${reportId}`;
  const prior = usage.reports[key];
  const previous = prior?.bytes ?? 0;
  if (prior && bytes <= previous) return usage;
  const time = Date.parse(now),
    started = Date.parse(usage.startedAt);
  // Client counters are estimates, never billing authority. Bound each device by
  // elapsed server time at 1 Gbit/s, including all of its report IDs.
  const deviceTotal = usage.deviceBytes?.[deviceId] ?? 0;
  const allowance = Math.max(1, (time - started) / 1000) * 125_000_000;
  if (
    !Number.isSafeInteger(bytes) ||
    bytes < 0 ||
    !Number.isFinite(allowance) ||
    deviceTotal + bytes - previous > allowance
  )
    return { ...usage, limitedReports: (usage.limitedReports ?? 0) + 1 };
  const reports = { ...usage.reports };
  const full = !prior && Object.keys(reports).length >= 512;
  if (full) {
    const oldest = Object.keys(reports).sort((a, b) =>
      reports[a]!.updatedAt.localeCompare(reports[b]!.updatedAt)
    )[0]!;
    delete reports[oldest];
  }
  // Once bounded history rolls over, baseline unfamiliar streams instead of
  // replaying their historical bytes. Subsequent increments continue counting.
  const baseline = full;
  const delta = baseline ? 0 : bytes - previous;
  reports[key] = { bytes, deviceId, updatedAt: now };
  return {
    ...usage,
    receivedBytes: usage.receivedBytes + delta,
    reports,
    deviceBytes: { ...usage.deviceBytes, [deviceId]: deviceTotal + delta },
    reportedDevices: { ...usage.reportedDevices, [deviceId]: true },
    limitedReports: (usage.limitedReports ?? 0) + (baseline ? 1 : 0),
  };
}
export function summarizeRoomUsage(usage: RoomUsage | undefined) {
  if (!usage) return null;
  const reported = new Set([
    ...Object.keys(usage.reportedDevices ?? {}),
    ...Object.values(usage.reports).map((report) => report.deviceId),
  ]);
  // List prices, before account-wide allowances. TURN-to-SFU is not double charged.
  return {
    startedAt: usage.startedAt,
    receivedBytes: usage.receivedBytes,
    devices: Object.keys(usage.devices).length,
    reportingDevices: reported.size,
    limitedReports: usage.limitedReports ?? 0,
    webSocketMessages: usage.webSocketMessages,
    httpRequests: usage.httpRequests,
    storageWrites: usage.storageWrites + (usage.httpCounterWrites ?? 0),
    sfuEgressUsd: (usage.receivedBytes / 1_000_000_000) * 0.05,
    durableRequestsUsd:
      ((usage.httpRequests + usage.webSocketMessages / 20) / 1_000_000) * 0.15,
    pricingDate: '2026-09-08',
    currency: 'USD',
    basis: 'client-reported RTP payload and server request counters',
    complete: false,
  };
}
