import { expect, it } from 'vitest';
import { recoverableColorRouteFixture } from './recoverable-color-route';

it('refuses fixture finalization before dispatch or after cancellation', async () => {
  for (const phase of ['reserved', 'prepared', 'canceled']) {
    const f = recoverableColorRouteFixture();
    const input = {
      id: 'synthetic-operation',
      generation: '0',
      requestHash: 'hash',
      intent: { kind: 'event', id: '11' },
    };
    await f.rpc('calendar_google_color_operation', {
      p_actor_id: 'actor',
      p_action: 'reserve',
      p_input: input,
    });
    if (phase !== 'reserved')
      await f.rpc('calendar_google_color_operation', {
        p_actor_id: 'actor',
        p_action: 'prepare',
        p_input: {
          ...input,
          generation: '1',
          prepared: { baseETag: 'original' },
        },
      });
    if (phase === 'canceled')
      await f.rpc('calendar_google_color_operation', {
        p_actor_id: 'actor',
        p_action: 'cancel',
        p_input: { ...input, generation: '1' },
      });
    const color = f.event.color;
    const result = await f.rpc('calendar_google_color_operation', {
      p_actor_id: 'actor',
      p_action: 'finalize',
      p_input: {
        ...input,
        generation: '1',
        outcome: 'applied',
        snapshot: { compatibilityColor: 'RED', metadata: {} },
      },
    });
    expect(result.error?.code).toBe('40001');
    expect(f.operation()?.phase).toBe(phase);
    expect(f.event.color).toBe(color);
  }
});
