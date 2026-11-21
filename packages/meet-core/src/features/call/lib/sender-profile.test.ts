import { describe, expect, it } from 'vitest';
import { withOpusResilience } from './audio-sdp';
import { planSenderEncodings } from './bandwidth';
import { readMeetMediaFlags } from './media-flags';
import {
  contentHintFor,
  cpuLimitationOf,
  initialCpuPressure,
  nextCpuPressure,
  senderPriority,
} from './sender-profile';

const answer = (lines: string[]) => ({
  type: 'answer' as const,
  sdp: ['v=0', ...lines, ''].join('\r\n'),
});

describe('withOpusResilience', () => {
  const mic = new Set(['0']);
  it('adds FEC to every Opus section and DTX to microphones only', () => {
    const result = withOpusResilience(
      answer([
        'm=audio 9 UDP/TLS/RTP/SAVPF 111 0',
        'a=mid:0',
        'a=rtpmap:111 opus/48000/2',
        'a=fmtp:111 minptime=10;useinbandfec=0;usedtx=0',
        'a=rtpmap:0 PCMU/8000',
        'a=fmtp:0 foo=1',
        'm=audio 9 UDP/TLS/RTP/SAVPF 111',
        'a=mid:3',
        'a=rtpmap:111 opus/48000/2',
      ]),
      mic,
      true
    );
    expect(result.sdp).toContain(
      'a=mid:0\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 minptime=10;useinbandfec=1;usedtx=1\r\n'
    );
    expect(result.sdp).toContain('a=fmtp:0 foo=1\r\n');
    // Payload 111 in the screen-audio section gets its own fmtp line.
    expect(result.sdp).toContain(
      'a=mid:3\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 useinbandfec=1;usedtx=0\r\n'
    );
  });

  it('turns DTX off explicitly when opted out', () => {
    const result = withOpusResilience(
      answer([
        'm=audio 9 RTP 109',
        'a=mid:0',
        'a=rtpmap:109 opus/48000/2',
        'a=fmtp:109 usedtx=1',
      ]),
      mic,
      false
    );
    expect(result.sdp).toContain('a=fmtp:109 useinbandfec=1;usedtx=0');
  });

  it('keeps LF line endings and leaves video-only descriptions unchanged', () => {
    const lf = {
      type: 'answer' as const,
      sdp: 'v=0\nm=audio 9 RTP 111\na=mid:0\na=rtpmap:111 opus/48000/2\n',
    };
    expect(withOpusResilience(lf, mic, true).sdp).toContain(
      'a=rtpmap:111 opus/48000/2\na=fmtp:111 useinbandfec=1;usedtx=1\n'
    );
    const video = answer(['m=video 9 RTP 96', 'a=rtpmap:96 VP8/90000']);
    expect(withOpusResilience(video, mic, true)).toBe(video);
    expect(withOpusResilience(undefined, mic, true)).toBeUndefined();
  });
});

describe('cpuLimitationOf', () => {
  it('treats only all-none reports as clean', () => {
    expect(cpuLimitationOf(['none', 'cpu'])).toBe(true);
    expect(cpuLimitationOf(['none', 'none'])).toBe(false);
    expect(cpuLimitationOf(['bandwidth'])).toBeNull();
    expect(cpuLimitationOf([])).toBeNull();
  });
});

describe('readMeetMediaFlags with denied storage', () => {
  it('falls back to defaults when reading storage throws', () => {
    const denied = {
      getItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(readMeetMediaFlags(denied)).toMatchObject({
      opusDtx: true,
      cpuAdaptation: true,
    });
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
