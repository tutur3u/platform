import { afterEach, describe, expect, it, vi } from 'vitest';
import { createChatRouteTimer } from './route-timing';

function fakeClock() {
  let t = 1000;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

describe('createChatRouteTimer', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('records sequential pre-stream spans and the Server-Timing header', () => {
    const clock = fakeClock();
    const timer = createChatRouteTimer(clock.now);
    clock.advance(40);
    timer.mark('auth');
    clock.advance(25);
    timer.mark('mira runtime');
    clock.advance(5);
    timer.streamStarted();

    expect(timer.timing.preStream).toEqual({ auth: 40, mira_runtime: 25 });
    expect(timer.timing.preStreamMs).toBe(70);
    expect(timer.serverTimingHeader()).toBe(
      'auth;dur=40, mira_runtime;dur=25, pre_stream;dur=70'
    );
  });

  it('tracks first chunk, first text, steps, tools and total time', () => {
    const clock = fakeClock();
    const timer = createChatRouteTimer(clock.now);
    timer.streamStarted();
    clock.advance(300);
    timer.chunk('start-step');
    clock.advance(200);
    timer.chunk('tool-call');
    timer.tool('get_day_overview', 180.4);
    timer.step({
      finishReason: 'tool-calls',
      toolCalls: [{ toolName: 'get_day_overview' }],
      usage: { inputTokens: 9000, outputTokens: 12 },
    });
    clock.advance(400);
    timer.chunk('text-delta');
    clock.advance(100);
    timer.chunk('text-delta');
    timer.step({ finishReason: 'stop', usage: { outputTokens: 80 } });

    const timing = timer.finish();
    expect(timing.firstChunkMs).toBe(300);
    expect(timing.firstTextMs).toBe(900);
    expect(timing.toolMs).toEqual({ get_day_overview: 180 });
    expect(timing.steps).toEqual([
      {
        endMs: 500,
        finishReason: 'tool-calls',
        inputTokens: 9000,
        outputTokens: 12,
        tools: ['get_day_overview'],
      },
      {
        endMs: 1000,
        finishReason: 'stop',
        inputTokens: undefined,
        outputTokens: 80,
        tools: [],
      },
    ]);
    expect(timing.totalMs).toBe(1000);
  });

  it('logs one JSON line only when AI_CHAT_TIMING_LOG=1', () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    createChatRouteTimer(fakeClock().now).finish();
    expect(info).not.toHaveBeenCalled();

    vi.stubEnv('AI_CHAT_TIMING_LOG', '1');
    createChatRouteTimer(fakeClock().now).finish();
    expect(info).toHaveBeenCalledTimes(1);
    expect(JSON.parse(info.mock.calls[0]![0] as string)).toMatchObject({
      event: 'ai_chat_timing',
    });
  });
});
