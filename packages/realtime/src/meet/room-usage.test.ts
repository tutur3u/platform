import { describe, expect, it } from 'vitest';
import {
  applyUsageReport,
  createRoomUsage,
  summarizeRoomUsage,
} from './room-usage';

describe('room cost estimates', () => {
  it('counts cumulative reports once and ignores late smaller values', () => {
    let usage = createRoomUsage();
    usage = applyUsageReport(usage, 'a', 'report', 1000, 'now');
    usage = applyUsageReport(usage, 'a', 'report', 1000, 'now');
    usage = applyUsageReport(usage, 'a', 'report', 900, 'now');
    usage = applyUsageReport(usage, 'a', 'report', 1200, 'now');
    usage = applyUsageReport(usage, 'b', 'report', 500, 'now');
    expect(usage.receivedBytes).toBe(1700);
  });
  it('never presents missing measurements as complete billing', () => {
    expect(summarizeRoomUsage(undefined)).toBeNull();
    const usage = createRoomUsage();
    usage.receivedBytes = 1_000_000_000;
    usage.webSocketMessages = 20;
    usage.httpRequests = 1;
    const summary = summarizeRoomUsage(usage)!;
    expect(summary.sfuEgressUsd).toBe(0.05);
    expect(summary.durableRequestsUsd).toBeCloseTo(0.0000003, 12);
    expect(summary.complete).toBe(false);
  });
  it('retains a zero-byte report for measurement coverage', () => {
    const usage = applyUsageReport(createRoomUsage(), 'a', 'report', 0, 'now');
    expect(summarizeRoomUsage(usage)?.reportingDevices).toBe(1);
  });
});
