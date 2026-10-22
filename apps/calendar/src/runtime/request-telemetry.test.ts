import { describe, expect, it, vi } from 'vitest';

vi.mock('@tanstack/react-start/server-only', () => ({}));

import { withCalendarRequest } from './request-context';
import {
  type CalendarTelemetryPort,
  setLogDrainUserContext,
  withCronLogDrain,
} from './request-telemetry.server';

describe('request telemetry isolation', () => {
  it('keeps two concurrent actors on their injected request ports', async () => {
    const first: unknown[] = [];
    const second: unknown[] = [];
    const port = (actors: unknown[]): CalendarTelemetryPort => ({
      setActor: (actor) => actors.push(actor),
      cron: (_options, run) => run(),
    });
    const request = (userId: string, actors: unknown[]) =>
      withCalendarRequest(
        {
          request: new Request(
            'https://calendar.test/api/cron/calendar/provider-sync'
          ),
          responseHeaders: new Headers(),
          waitUntil: () => {},
          telemetry: port(actors),
        },
        async () => {
          await Promise.resolve();
          setLogDrainUserContext({ userId });
          return withCronLogDrain(
            {
              jobId: 'provider-sync',
              path: '/api/cron/calendar/provider-sync',
            },
            async () => new Response(userId)
          );
        }
      );
    const responses = await Promise.all([
      request('actor-one', first),
      request('actor-two', second),
    ]);
    expect(first).toEqual([{ userId: 'actor-one' }]);
    expect(second).toEqual([{ userId: 'actor-two' }]);
    expect(await responses[0]?.text()).toBe('actor-one');
    expect(await responses[1]?.text()).toBe('actor-two');
  });
});
