import { describe, expect, it } from 'vitest';
import {
  applyUsageReport,
  createRoomUsage,
  summarizeRoomUsage,
} from './room-usage';

describe('room cost estimates', () => {
  it('counts cumulative reports once and ignores late smaller values', () => {
    let usage = createRoomUsage();
    usage = applyUsageReport(
      usage,
      'a',
      'report',
      1000,
      new Date().toISOString()
    );
    usage = applyUsageReport(
      usage,
      'a',
      'report',
      1000,
      new Date().toISOString()
    );
    usage = applyUsageReport(
      usage,
      'a',
      'report',
      900,
      new Date().toISOString()
    );
    usage = applyUsageReport(
      usage,
      'a',
      'report',
      1200,
      new Date().toISOString()
    );
    usage = applyUsageReport(
      usage,
      'b',
      'report',
      500,
      new Date().toISOString()
    );
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
    const usage = applyUsageReport(
      createRoomUsage(),
      'a',
      'report',
      0,
      new Date().toISOString()
    );
    expect(summarizeRoomUsage(usage)?.reportingDevices).toBe(1);
  });
});

it('bounds implausible reports and keeps counting after bounded history rotates', () => {
  let usage = createRoomUsage();
  const now = new Date().toISOString();
  expect(
    applyUsageReport(usage, 'a', 'x', Number.MAX_SAFE_INTEGER, now)
      .receivedBytes
  ).toBe(0);
  for (let i = 0; i < 513; i++)
    usage = applyUsageReport(usage, 'a', String(i), 10, now);
  expect(Object.keys(usage.reports)).toHaveLength(512);
  const total = usage.receivedBytes;
  usage = applyUsageReport(usage, 'a', '512', 30, now);
  expect(usage.receivedBytes).toBe(total + 20);
  const replay = applyUsageReport(usage, 'a', '0', 10, now);
  expect(replay.receivedBytes).toBe(usage.receivedBytes);
  expect(summarizeRoomUsage(replay)?.limitedReports).toBeGreaterThan(0);
});

it('does not let a rejected report baseline another device’s initial bytes', () => {
  const now = new Date().toISOString();
  const rejected = applyUsageReport(
    createRoomUsage(),
    'bad-device',
    'bad-report',
    Number.MAX_SAFE_INTEGER,
    now
  );
  expect(
    applyUsageReport(rejected, 'good-device', 'new-report', 1000, now)
      .receivedBytes
  ).toBe(1000);
});
