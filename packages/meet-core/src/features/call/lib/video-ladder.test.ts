import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { initialSendEncodings, planSenderEncodings } from './bandwidth';
import {
  floorLimits,
  floorScale,
  initialVideoLadder,
  nextVideoStep,
  VIDEO_FLOOR_FPS,
  VIDEO_FLOOR_HEIGHT,
  VIDEO_STEP_UP_AFTER_SAMPLES,
  videoStepDemand,
} from './video-ladder';

const healthy = { available: 5_000_000, rtt: 30, loss: 0 };

describe('downgrade ladder', () => {
  it('asks for a lower rung as the link gets worse', () => {
    expect(videoStepDemand(healthy, 1, false)).toBe(0);
    expect(videoStepDemand(healthy, 1, true)).toBe(1);
    expect(videoStepDemand({ ...healthy, available: 300_000 }, 1, true)).toBe(
      2
    );
    expect(videoStepDemand({ ...healthy, loss: 0.1 }, 1, true)).toBe(2);
    expect(videoStepDemand({ ...healthy, available: 160_000 }, 1, true)).toBe(
      3
    );
    expect(videoStepDemand({ ...healthy, rtt: 1500 }, 1, true)).toBe(3);
    expect(videoStepDemand({ available: 0, rtt: null, loss: 1 }, 1, true)).toBe(
      3
    );
  });

  it('steps down at once and back up one rung per sustained recovery', () => {
    let state = nextVideoStep(initialVideoLadder(), 3);
    expect(state.step).toBe(3);
    for (let i = 1; i < VIDEO_STEP_UP_AFTER_SAMPLES; i++) {
      state = nextVideoStep(state, 0);
      expect(state.step).toBe(3);
    }
    state = nextVideoStep(state, 0);
    expect(state.step).toBe(2);
    // A relapse cancels the climb.
    state = nextVideoStep(state, 0);
    state = nextVideoStep(state, 2);
    expect(state).toEqual({ step: 2, healthy: 0 });
    // A sample without measurements changes nothing.
    expect(nextVideoStep(state, null)).toBe(state);
  });

  it('bottoms out at about 180p and 10 fps', () => {
    expect(VIDEO_FLOOR_HEIGHT).toBe(180);
    expect(VIDEO_FLOOR_FPS).toBe(10);
    expect(floorScale(720)).toBe(4);
    expect(floorScale(360)).toBe(2);
    expect(floorScale(null)).toBe(4);
    expect(floorScale(120)).toBe(1);
    expect(floorLimits(3, 0)).toEqual({ maxBitrate: 40_000, maxFramerate: 10 });
    expect(floorLimits(2, 1_000_000)).toEqual({
      maxBitrate: 120_000,
      maxFramerate: 15,
    });
  });

  it('keeps the lowest simulcast layer live at the floor and sheds the larger ones', () => {
    const layers = initialSendEncodings('video', 4);
    const at = (step: number) =>
      planSenderEncodings(
        'video',
        'auto',
        healthy,
        { participants: 4 },
        true,
        layers,
        1,
        step
      );
    expect(at(0).map((layer) => layer.active)).toEqual([true, true, true]);
    expect(at(1).map((layer) => layer.active)).toEqual([false, true, true]);
    expect(at(2).map((layer) => layer.active)).toEqual([false, false, true]);
    expect(at(3)[2]).toMatchObject({
      active: true,
      maxFramerate: 10,
      scaleResolutionDownBy: 4,
    });
  });

  it('floors a single encoding by capture height', () => {
    const [encoding] = planSenderEncodings(
      'video',
      'auto',
      healthy,
      {},
      true,
      [{}],
      1,
      3,
      false,
      360
    );
    expect(encoding).toMatchObject({
      active: true,
      scaleResolutionDownBy: 2,
      maxFramerate: 10,
    });
  });
});

describe('video is never paused for network quality', () => {
  const networks = [0, 20_000, 100_000, 400_000, 2_000_000].flatMap(
    (available) =>
      [0, 400, 1500, 8000].flatMap((rtt) =>
        [0, 0.06, 0.2, 1].map((loss) => ({ available, rtt, loss }))
      )
  );

  it.each(['simulcast', 'single'] as const)(
    'always leaves a %s camera sending, on every link condition',
    (shape) => {
      for (const network of networks)
        for (const participants of [2, 20, 60]) {
          const encodings =
            shape === 'simulcast'
              ? initialSendEncodings('video', participants)
              : [{}];
          const plan = planSenderEncodings(
            'video',
            'auto',
            network,
            { participants, visibleTiles: participants },
            true,
            encodings
          );
          const live = plan.filter((layer) => layer.active);
          expect(live.length).toBeGreaterThan(0);
          for (const layer of live) {
            expect(layer.maxFramerate).toBeGreaterThanOrEqual(VIDEO_FLOOR_FPS);
            expect(layer.maxBitrate).toBeGreaterThan(0);
          }
        }
    }
  );

  it('has no automatic audio-only or paused-video path left in the room code', () => {
    const root = join(__dirname, '..');
    const sources: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name))
          sources.push(path);
      }
    };
    walk(root);
    const offenders = sources.filter((file) =>
      /setAudioOnly|startAudioOnly|nextAudioOnly|video_paused_network|resume_video|retry_video|reconnectReceivingMedia/.test(
        readFileSync(file, 'utf8')
      )
    );
    expect(offenders).toEqual([]);
  });
});
