import { afterEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  createControlState,
  familyOpen,
  recordUsage,
  rollover,
  setOperatorStop,
} from './control-state';

const DAY = 24 * 60 * 60 * 1000;
const t0 = Date.UTC(2026, 9, 26, 12);

afterEach(() => {
  vi.restoreAllMocks();
});

describe('control state', () => {
  it('stops a family at exactly its budget without billing rejected work', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const state = createControlState(t0);
    expect(recordUsage(state, 'offline', 4, 5, t0)).toBe(true);
    expect(familyOpen(state, 'offline')).toBe(true);
    recordUsage(state, 'offline', 1, 5, t0);
    expect(familyOpen(state, 'offline')).toBe(false);
    recordUsage(state, 'offline', 3, 5, t0);
    expect(state.families.offline?.used).toBe(5);
    // Another family is unaffected.
    expect(familyOpen(state, 'replay')).toBe(true);
  });

  it('treats a zero-delta refresh with no flag change as a pure read', () => {
    const state = createControlState(t0);
    recordUsage(state, 'replay', 1, 100, t0);
    expect(recordUsage(state, 'replay', 0, 100, t0)).toBe(false);
    expect(recordUsage(state, 'replay', 0, 200, t0)).toBe(true);
  });

  it('clears family budget stops at the next UTC day, never the operator stop', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const state = createControlState(t0);
    recordUsage(state, 'offline', 5, 5, t0);
    setOperatorStop(state, true, t0);
    expect(rollover(state, t0 + 60_000)).toBe(false);
    expect(state.families.offline?.stopped).toBe(true);

    expect(rollover(state, t0 + DAY)).toBe(true);
    expect(state.families.offline).toMatchObject({
      stopped: false,
      used: 0,
      warned: false,
    });
    // The operator stop stays until an operator resumes.
    expect(familyOpen(state, 'offline')).toBe(false);
    setOperatorStop(state, false, t0 + DAY);
    expect(familyOpen(state, 'offline')).toBe(true);
  });

  it('serves a flooded family again on the next day', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const state = createControlState(t0);
    recordUsage(state, 'offline', 10, 5, t0);
    expect(familyOpen(state, 'offline')).toBe(false);
    rollover(state, t0 + DAY);
    recordUsage(state, 'offline', 1, 5, t0 + DAY);
    expect(familyOpen(state, 'offline')).toBe(true);
  });
});
