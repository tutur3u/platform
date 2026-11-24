import { describe, expect, it, vi } from 'vite-plus/test';
import { keyOf } from './__tests__/sqlite';
import {
  type ControlPort,
  type ControlResult,
  createControlEntry,
  type OpPoint,
} from './control-entry';

const fence = {
  mode: 'running',
  version: 3,
  background: 'running',
  budgetParks: [],
  changedAtMs: 1,
  actor: 'op',
  reason: 'r',
} as const;
const ok: ControlResult = { ok: true, fence, changed: true };

function setup(secret: unknown = keyOf(1), environment: unknown = 'staging') {
  const port: ControlPort = {
    readFence: vi.fn(async () => ok),
    setFence: vi.fn(async () => ok),
    setBackground: vi.fn(async () => ok),
  };
  const control = vi.fn(() => port);
  const points: OpPoint[] = [];
  const entry = createControlEntry({
    secret,
    environment,
    control,
    recordOp: (point) => points.push(point),
  });
  return { entry, port, control, points };
}

const methods = (entry: ReturnType<typeof setup>['entry'], key: unknown) => [
  entry.readFence(key),
  entry.setFence(key, 'stopped', 'r', 'a'),
  entry.parkBackground(key, 'r', 'a'),
  entry.resumeBackground(key, 'r', 'a'),
];

describe('ControlEntry', () => {
  it('refuses every method with a wrong or missing key and makes no object call', async () => {
    for (const key of [keyOf(2), undefined, '', 'x'.repeat(43)]) {
      const { entry, control, points } = setup();
      for (const result of await Promise.all(methods(entry, key))) {
        expect(result).toEqual({ ok: false, error: 'unauthorized' });
      }
      expect(control).not.toHaveBeenCalled();
      expect(points.every((point) => point.outcome === 'unauthorized')).toBe(
        true
      );
    }
  });

  it('refuses everything when the auth-side secret is absent', async () => {
    const { entry, control } = setup(null);
    for (const result of await Promise.all(methods(entry, keyOf(1)))) {
      expect(result).toEqual({ ok: false, error: 'unauthorized' });
    }
    expect(control).not.toHaveBeenCalled();
  });

  it('refuses a dropped previous key after rotation', async () => {
    const { entry, control } = setup(JSON.stringify({ current: keyOf(2) }));
    expect(await entry.readFence(keyOf(1))).toEqual({
      ok: false,
      error: 'unauthorized',
    });
    expect(control).not.toHaveBeenCalled();
  });

  it('answers unavailable with no object call when the environment is unset', async () => {
    const { entry, control } = setup(keyOf(1), 'prod');
    expect(await entry.readFence(keyOf(1))).toEqual({
      ok: false,
      error: 'unavailable',
    });
    expect(control).not.toHaveBeenCalled();
  });

  it('passes the presented key and arguments through to the object', async () => {
    const { entry, port, control } = setup();
    expect(await entry.setFence(keyOf(1), 'stopped', 'incident', 'op')).toEqual(
      ok
    );
    expect(control).toHaveBeenCalledWith('staging');
    expect(port.setFence).toHaveBeenCalledWith(
      keyOf(1),
      'stopped',
      'incident',
      'op'
    );
    await entry.parkBackground(keyOf(1), 'spend', 'op');
    expect(port.setBackground).toHaveBeenCalledWith(
      keyOf(1),
      'parked',
      'spend',
      'op'
    );
    await entry.resumeBackground(keyOf(1), 'ok', 'op');
    expect(port.setBackground).toHaveBeenCalledWith(
      keyOf(1),
      'running',
      'ok',
      'op'
    );
  });

  it('records a previous_key point for a call accepted with the previous key', async () => {
    const { entry, points } = setup(
      JSON.stringify({ current: keyOf(2), previous: keyOf(1) })
    );
    expect(await entry.readFence(keyOf(1))).toEqual(ok);
    expect(points).toEqual([
      {
        category: 'control',
        entry: 'control',
        method: 'readFence',
        outcome: 'previous_key',
      },
    ]);
  });

  it('turns a failed object call into unavailable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { entry, port } = setup();
    vi.mocked(port.readFence).mockRejectedValueOnce(new Error('reset'));
    expect(await entry.readFence(keyOf(1))).toEqual({
      ok: false,
      error: 'unavailable',
    });
  });

  it('keeps the previous_key signal when the object call fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { entry, port, points } = setup(
      JSON.stringify({ current: keyOf(2), previous: keyOf(1) })
    );
    vi.mocked(port.readFence).mockRejectedValueOnce(new Error('reset'));
    expect(await entry.readFence(keyOf(1))).toEqual({
      ok: false,
      error: 'unavailable',
    });
    expect(points.at(-1)?.outcome).toBe('previous_key');
  });
});
