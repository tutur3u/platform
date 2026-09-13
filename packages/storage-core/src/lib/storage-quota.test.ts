import { describe, expect, it } from 'vitest';
import {
  fitsStorageBudget,
  readStorageUsageBytes,
  resolveStorageByteLimit,
} from './storage-quota';

describe('storage consumption boundaries', () => {
  it('never invents quota when accounting is unavailable or invalid', () => {
    for (const value of [
      null,
      undefined,
      '',
      -1,
      1.2,
      Infinity,
      NaN,
      'unlimited',
      true,
    ])
      expect(resolveStorageByteLimit(value)).toBe(0);
    expect(resolveStorageByteLimit(100, true)).toBe(0);
    expect(resolveStorageByteLimit('104857600')).toBe(104857600);
  });
  it('counts replacement bytes once and rejects uncertain or overflowing usage', () => {
    expect(fitsStorageBudget(90, 20, 100, 10)).toBe(true);
    expect(fitsStorageBudget(90, 20, 100)).toBe(false);
    expect(fitsStorageBudget(NaN, 20, 100)).toBe(false);
    expect(fitsStorageBudget(90, 1.5, 100)).toBe(false);
    expect(fitsStorageBudget(90, 20, 100, 100)).toBe(false);
    expect(fitsStorageBudget(0, 1, 0)).toBe(false);
  });
});

it('does not treat missing object sizes as free storage', () => {
  expect(readStorageUsageBytes(0)).toBe(0);
  expect(readStorageUsageBytes('1024')).toBe(1024);
  for (const size of [null, undefined, '', -1, 0.5, Infinity, 'bad'])
    expect(() => readStorageUsageBytes(size)).toThrow('metadata');
});
