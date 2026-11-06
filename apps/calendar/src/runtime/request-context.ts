import { runtimeAppBase } from '@tuturuuu/start-bridge/app-url';
import {
  type BridgeRequestInit,
  createRequestLocal,
  maybeBridgeRequest,
  withBridgeRequest,
} from '@tuturuuu/start-bridge/request-context';
import type { CalendarTelemetryPort } from './request-telemetry.server';
import type {
  CalendarExecutionContext,
  CalendarWorkerEnvironment,
} from './worker-contract';

export {
  after,
  connection,
  cookies,
  headers,
} from '@tuturuuu/start-bridge/request-context';

export interface CalendarRequestContext extends BridgeRequestInit {
  telemetry?: CalendarTelemetryPort;
  responseHeaders: Headers;
  waitUntil: (work: Promise<unknown>) => void;
  cloudflare?: {
    env: CalendarWorkerEnvironment;
    ctx: CalendarExecutionContext;
  };
}
const contextSlot = createRequestLocal<CalendarRequestContext>(
  'calendar request adapter'
);

export function withCalendarRequest<T>(
  context: CalendarRequestContext,
  run: () => T
): T {
  return withBridgeRequest(
    {
      ...context,
      cookieSource: context.cookieSource ?? context.request.headers,
      appBase: context.appBase ?? runtimeAppBase(),
      locals: new Map(context.locals ?? maybeBridgeRequest()?.locals),
    },
    () => {
      contextSlot.set(context);
      return run();
    }
  );
}

export function calendarRequest() {
  const context = contextSlot.get();
  if (!context) throw new Error('Calendar request context is unavailable');
  return context;
}
