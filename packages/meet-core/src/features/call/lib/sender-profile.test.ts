import { describe, expect, it } from 'vitest';
import { withOpusResilience } from './audio-sdp';
import { planSenderEncodings } from './bandwidth';
import {
  contentHintFor,
  initialCpuPressure,
  nextCpuPressure,
  senderPriority,
} from './sender-profile';

const answer = (lines: string[]) => ({
  type: 'answer' as const,
  sdp: ['v=0', ...lines, ''].join('\r\n'),
});

describe('withOpusResilience', () => {
  it('adds in-band FEC and DTX to Opus without touching other codecs', () => {
    const result = withOpusResilience(
      answer([
        'm=audio 9 UDP/TLS/RTP/SAVPF 111 0',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10;useinbandfec=1',
        'a=rtpmap:0 PCMU/8000',
        'a=fmtp:0 foo=1',
      ]),
      true
    );
    expect(result.sdp).toContain(
      'a=fmtp:111 minptime=10;useinbandfec=1;usedtx=1\r\n'
    );
    expect(result.sdp).toContain('a=fmtp:0 foo=1\r\n');
  });

  it('creates a missing fmtp line and honours a DTX opt-out', () => {
    const result = withOpusResilience(
      answer(['m=audio 9 RTP 109', 'a=rtpmap:109 opus/48000/2']),
      false
    );
    expect(result.sdp).toContain(
      'a=rtpmap:109 opus/48000/2\r\na=fmtp:109 useinbandfec=1\r\n'
    );
    expect(result.sdp).not.toContain('usedtx');
  });

  it('leaves video-only and missing descriptions unchanged', () => {
    const video = answer(['m=video 9 RTP 96', 'a=rtpmap:96 VP8/90000']);
    expect(withOpusResilience(video, true)).toBe(video);
    expect(withOpusResilience(undefined, true)).toBeUndefined();
  });
});

describe('sender profile', () => {
  it('prioritises speech, then screens, then cameras', () => {
    expect(senderPriority('audio')).toBe('high');
    expect(senderPriority('screen')).toBe('medium');
    expect(senderPriority('video')).toBe('low');
    expect(contentHintFor('screen')).toBe('detail');
    expect(contentHintFor('screen_audio')).toBe('music');
  });

  it('sheds CPU load at once and backs off after a quick relapse', () => {
    let pressure = nextCpuPressure(initialCpuPressure(), true, 0);
    expect(pressure.limited).toBe(true);
    for (let n = 1; n < 10; n++)
      pressure = nextCpuPressure(pressure, false, n * 3000);
    expect(pressure.limited).toBe(true);
    pressure = nextCpuPressure(pressure, false, 30_000);
    expect(pressure.limited).toBe(false);
    pressure = nextCpuPressure(pressure, true, 40_000);
    expect(pressure).toMatchObject({ limited: true, required: 20 });
    // Missing statistics neither recover nor relapse.
    expect(nextCpuPressure(pressure, null, 50_000)).toEqual(pressure);
  });

  it('forgives relapses after ten quiet minutes', () => {
    const pressure = {
      limited: false,
      healthy: 0,
      required: 40,
      recoveredAt: 0,
    };
    expect(nextCpuPressure(pressure, false, 700_000).required).toBe(10);
  });

  it('drops the full layer and caps frame rate while CPU-bound', () => {
    const layers = [{ rid: 'f' }, { rid: 'h' }, { rid: 'q' }];
    const network = { available: 3_000_000, rtt: 40, loss: 0 };
    const plan = (cpu: boolean) =>
      planSenderEncodings(
        'video',
        'auto',
        network,
        { participants: 4 },
        true,
        layers,
        1,
        false,
        cpu
      );
    expect(plan(false).map((layer) => layer.active)).toEqual([
      true,
      true,
      true,
    ]);
    const limited = plan(true);
    expect(limited.map((layer) => layer.active)).toEqual([false, true, true]);
    expect(limited.every((layer) => (layer.maxFramerate ?? 0) <= 15)).toBe(
      true
    );
    const screen = planSenderEncodings(
      'screen',
      'auto',
      network,
      {},
      true,
      [{}],
      1,
      false,
      true
    )[0];
    expect(screen).toMatchObject({ maxFramerate: 5, scaleResolutionDownBy: 1 });
  });
});
