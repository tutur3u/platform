import { describe, expect, it } from 'vitest';
import {
  initialReceiverGovernor,
  layerForTile,
  nextReceiverGovernor,
  planLayerChanges,
  type ReceiverSample,
} from './layer-policy';
import { readMeetMediaFlags } from './media-flags';
import { sampleReceiver } from './subscriber-layers';

const healthy: ReceiverSample = {
  loss: 0,
  freezes: 0,
  rttMs: 80,
  availableKbps: null,
  receivedKbps: 900,
};
const congested: ReceiverSample = { ...healthy, loss: 0.1 };

describe('layerForTile', () => {
  it('picks the smallest layer that fills the rendered tile', () => {
    const tile = (renderedPx: number | null, spotlight = false) =>
      layerForTile({ renderedPx, spotlight, visibleTiles: 4 });
    expect(tile(120)).toBe('low');
    expect(tile(240)).toBe('mid');
    expect(tile(720)).toBe('high');
    expect(tile(120, true)).toBe('mid');
    expect(tile(720, true)).toBe('high');
  });

  it('falls back to window shape before a tile is measured', () => {
    expect(
      layerForTile({ renderedPx: null, spotlight: true, visibleTiles: 12 })
    ).toBe('high');
    expect(
      layerForTile({ renderedPx: null, spotlight: false, visibleTiles: 12 })
    ).toBe('low');
    expect(
      layerForTile({ renderedPx: null, spotlight: false, visibleTiles: 4 })
    ).toBe('mid');
  });

  it('keeps thumbnails on the lowest layer in small mode except the spotlight', () => {
    expect(
      layerForTile({
        renderedPx: 720,
        spotlight: false,
        visibleTiles: 4,
        smallMode: true,
      })
    ).toBe('low');
    expect(
      layerForTile({
        renderedPx: 720,
        spotlight: true,
        visibleTiles: 4,
        smallMode: true,
      })
    ).toBe('high');
  });
});

describe('receiver governor', () => {
  const run = (samples: ReceiverSample[], start = 0, stepMs = 2000) =>
    samples.reduce(
      (governor, sample, index) =>
        nextReceiverGovernor(governor, sample, start + index * stepMs),
      initialReceiverGovernor()
    );

  it('steps down one layer per congested sample outside the cooldown', () => {
    expect(run([congested]).ceiling).toBe('mid');
    // Two samples 2 s apart fall inside the 4 s cooldown.
    expect(run([congested, congested]).ceiling).toBe('mid');
    expect(run([congested, congested, congested]).ceiling).toBe('low');
  });

  it('treats freezes, high RTT and a saturated receive estimate as congestion', () => {
    expect(run([{ ...healthy, freezes: 2 }]).ceiling).toBe('mid');
    expect(run([{ ...healthy, rttMs: 900 }]).ceiling).toBe('mid');
    expect(
      run([{ ...healthy, availableKbps: 500, receivedKbps: 499 }]).ceiling
    ).toBe('mid');
  });

  it('recovers one layer after five healthy samples', () => {
    const down = run([congested]);
    const four = [1, 2, 3, 4].reduce(
      (governor, n) => nextReceiverGovernor(governor, healthy, n * 2000),
      down
    );
    expect(four.ceiling).toBe('mid');
    expect(nextReceiverGovernor(four, healthy, 10_000).ceiling).toBe('high');
  });

  it('never upgrades on missing statistics', () => {
    const down = run([congested]);
    const blind = Array.from({ length: 20 }, (_, n) => n + 1).reduce(
      (governor, n) =>
        nextReceiverGovernor(governor, { ...healthy, loss: null }, n * 2000),
      down
    );
    expect(blind.ceiling).toBe('mid');
  });

  it('doubles the healthy run required after a failed upgrade probe', () => {
    let governor = run([congested]);
    for (let n = 1; n <= 5; n++)
      governor = nextReceiverGovernor(governor, healthy, n * 2000);
    expect(governor.ceiling).toBe('high');
    governor = nextReceiverGovernor(governor, congested, 14_000);
    expect(governor.ceiling).toBe('mid');
    expect(governor.required).toBe(10);
  });
});

describe('planLayerChanges', () => {
  it('downgrades at once and upgrades only after two consecutive samples', () => {
    const subscriptions = [
      { mid: '1', userId: 'a', requested: 'high' as const },
      { mid: '2', userId: 'b', requested: 'low' as const },
    ];
    const first = planLayerChanges(subscriptions, () => 'mid', 'high');
    expect(first.changes).toEqual([{ mid: '1', layer: 'mid' }]);
    expect(first.pending.get('2')).toBe(1);
    const second = planLayerChanges(
      [{ ...subscriptions[1]!, pendingUpgrade: 1 }],
      () => 'mid',
      'high'
    );
    expect(second.changes).toEqual([{ mid: '2', layer: 'mid' }]);
  });

  it('caps every tile at the receiver ceiling', () => {
    const plan = planLayerChanges(
      [{ mid: '1', userId: 'a', requested: 'high' }],
      () => 'high',
      'low'
    );
    expect(plan.changes).toEqual([{ mid: '1', layer: 'low' }]);
  });
});

describe('sampleReceiver', () => {
  const report = (entries: Record<string, unknown>[]) =>
    new Map(
      entries.map((entry) => [entry.id as string, entry])
    ) as unknown as RTCStatsReport;
  it('aggregates loss, freezes and bitrate deltas across camera receivers only', () => {
    const previous = new Map();
    const inbound = (
      id: string,
      mid: string,
      values: Record<string, number>
    ) => ({
      id,
      type: 'inbound-rtp',
      kind: 'video',
      mid,
      ...values,
    });
    sampleReceiver(
      report([
        inbound('a', '1', {
          packetsLost: 0,
          packetsReceived: 100,
          freezeCount: 0,
          bytesReceived: 0,
        }),
        inbound('s', '9', {
          packetsLost: 0,
          packetsReceived: 0,
          freezeCount: 0,
          bytesReceived: 0,
        }),
      ]),
      new Set(['1']),
      previous,
      0
    );
    const sample = sampleReceiver(
      report([
        inbound('a', '1', {
          packetsLost: 10,
          packetsReceived: 190,
          freezeCount: 1,
          bytesReceived: 250_000,
        }),
        inbound('s', '9', {
          packetsLost: 50,
          packetsReceived: 50,
          freezeCount: 3,
          bytesReceived: 0,
        }),
        {
          id: 'pair',
          type: 'candidate-pair',
          state: 'succeeded',
          nominated: true,
          currentRoundTripTime: 0.12,
        },
      ]),
      new Set(['1']),
      previous,
      2000
    );
    expect(sample.loss).toBe(0.1);
    expect(sample.freezes).toBe(1);
    expect(sample.rttMs).toBe(120);
    expect(sample.receivedKbps).toBe(1000);
  });
});

describe('readMeetMediaFlags', () => {
  it('defaults on and honours a valid local override only', () => {
    const storage = (value: string | null) => ({ getItem: () => value });
    expect(readMeetMediaFlags(storage(null)).layerSwitching).toBe(true);
    expect(
      readMeetMediaFlags(storage('{"layerSwitching":false}')).layerSwitching
    ).toBe(false);
    expect(
      readMeetMediaFlags(storage('{"layerSwitching":"no"}')).layerSwitching
    ).toBe(true);
    expect(readMeetMediaFlags(storage('{')).layerSwitching).toBe(true);
  });
});
