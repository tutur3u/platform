import '@tanstack/react-start/server-only';
import { calendarRequest } from './request-context';

export interface CalendarTelemetryPort {
  setActor(actor: { userId?: string | null; userEmail?: string | null }): void;
  cron<T extends Response>(
    options: { jobId: string; path: string; request?: Request },
    handler: () => Promise<T>
  ): Promise<T>;
}

export function setLogDrainUserContext(actor: {
  userId?: string | null;
  userEmail?: string | null;
}) {
  calendarRequest().telemetry?.setActor(actor);
}

export function withCronLogDrain<T extends Response>(
  options: { jobId: string; path: string; request?: Request },
  handler: () => Promise<T>
) {
  const port = calendarRequest().telemetry;
  if (port) return port.cron(options, handler);
  const enabled = process.env.PLATFORM_LOG_DRAIN_ENABLED?.trim().toLowerCase();
  if (
    process.env.PLATFORM_LOG_DRAIN_DATABASE_URL?.trim() &&
    !['0', 'false', 'off'].includes(enabled ?? '')
  )
    throw new Error(
      'Calendar request telemetry adapter required for enabled log drain'
    );
  return handler();
}

export async function createCalendarTelemetryPort(
  retainBackground: (work: Promise<void>) => void
) {
  const enabled = process.env.PLATFORM_LOG_DRAIN_ENABLED?.trim().toLowerCase();
  if (
    !process.env.PLATFORM_LOG_DRAIN_DATABASE_URL?.trim() ||
    ['0', 'false', 'off'].includes(enabled ?? '')
  )
    return undefined;
  const { createLegacyTelemetryPort } = await import(
    './legacy-telemetry-supplier.server'
  );
  return createLegacyTelemetryPort(retainBackground);
}
