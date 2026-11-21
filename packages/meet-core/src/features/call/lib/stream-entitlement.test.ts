import { meetStreamEntitlement } from '@tuturuuu/realtime/meet';
import { describe, expect, it } from 'vitest';
import { initialSendEncodings } from './bandwidth';
import { clampToStreamCap, streamCapFor } from './stream-entitlement';

describe('stream entitlement clamping', () => {
  const free = meetStreamEntitlement('free');
  const paid = meetStreamEntitlement('paid');

  it('defaults to free caps and has none for audio', () => {
    expect(streamCapFor(undefined, 'screen')).toEqual(free.screen);
    expect(streamCapFor(paid, 'video')).toEqual(paid.camera);
    expect(streamCapFor(paid, 'audio')).toBeUndefined();
  });

  it('downscales a free 1440p screen to 720p at 15 fps', () => {
    const [encoding] = clampToStreamCap(
      [{ maxBitrate: 5_000_000, maxFramerate: 30, scaleResolutionDownBy: 1 }],
      free.screen,
      1440
    );
    expect(encoding).toMatchObject({
      maxBitrate: 1_800_000,
      maxFramerate: 15,
      scaleResolutionDownBy: 2,
    });
  });

  it('lets a paid 1440p screen through untouched below its caps', () => {
    const [encoding] = clampToStreamCap(
      [{ maxBitrate: 1_800_000, maxFramerate: 15, scaleResolutionDownBy: 1 }],
      paid.screen,
      1440
    );
    expect(encoding).toMatchObject({
      maxBitrate: 1_800_000,
      maxFramerate: 15,
      scaleResolutionDownBy: 1,
    });
  });

  it('scales simulcast layers proportionally and keeps smaller layers', () => {
    const layers = clampToStreamCap(
      initialSendEncodings('video', 2).map((layer) => ({
        ...layer,
        maxBitrate: (layer.maxBitrate ?? 0) * 4,
        maxFramerate: 30,
      })),
      free.camera,
      1080
    );
    const total = layers.reduce(
      (sum, layer) => sum + (layer.maxBitrate ?? 0),
      0
    );
    expect(total).toBeLessThanOrEqual(900_000);
    expect(layers.map((layer) => layer.scaleResolutionDownBy)).toEqual([
      1.5, 2, 4,
    ]);
    expect(layers.every((layer) => layer.maxFramerate === 24)).toBe(true);
  });

  it('budgets unset layers before scaling to the aggregate cap', () => {
    const layers = clampToStreamCap(
      [{ maxBitrate: 900_000 }, {}, { maxBitrate: 300_000 }],
      free.camera,
      720
    );
    const total = layers.reduce(
      (sum, layer) => sum + (layer.maxBitrate ?? 0),
      0
    );
    expect(total).toBeLessThanOrEqual(900_000);
    expect(layers.every((layer) => (layer.maxBitrate ?? 0) > 0)).toBe(true);
  });

  it('keeps simulcast layers distinct when a large capture is downscaled', () => {
    const layers = clampToStreamCap(
      [
        { scaleResolutionDownBy: 1 },
        { scaleResolutionDownBy: 2 },
        { scaleResolutionDownBy: 4 },
      ],
      free.camera,
      2160
    );
    expect(layers.map((layer) => layer.scaleResolutionDownBy)).toEqual([
      3, 6, 12,
    ]);
  });

  it('never raises an adaptive limit', () => {
    const [encoding] = clampToStreamCap(
      [{ maxBitrate: 200_000, maxFramerate: 8, scaleResolutionDownBy: 4 }],
      paid.camera,
      720
    );
    expect(encoding).toMatchObject({
      maxBitrate: 200_000,
      maxFramerate: 8,
      scaleResolutionDownBy: 4,
    });
  });
});
