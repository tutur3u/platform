import '@tanstack/react-start/server-only';
import {
  setLogDrainUserContext,
  withCronLogDrain,
} from '../lib/infrastructure/log-drain';
import type { CalendarTelemetryPort } from './request-telemetry.server';

export function createLegacyTelemetryPort(
  retainBackground: (work: Promise<void>) => void
): CalendarTelemetryPort {
  return {
    setActor: setLogDrainUserContext,
    cron: (options, handler) =>
      withCronLogDrain(options, handler, retainBackground),
  };
}
