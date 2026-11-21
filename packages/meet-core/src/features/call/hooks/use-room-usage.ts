import { useCallback, useEffect, useRef } from 'react';
import type { MediaDiagnostics } from '../lib/media-diagnostics';
/** Media quality goes to the room every third usage interval (30 s). */
const QUALITY_EVERY = 3;

export function useRoomUsage(
  telemetry: MediaDiagnostics | undefined,
  enabled: boolean,
  send: (id: string, bytes: number) => void,
  sendQuality?: () => void
) {
  const id = useRef(crypto.randomUUID()),
    latest = useRef(telemetry);
  latest.current = telemetry;
  const sent = useRef<number | null>(null);
  const report = useCallback(() => {
    const bytes = latest.current?.receivedBytesTotal;
    if (enabled && bytes !== undefined && bytes !== sent.current) {
      send(id.current, bytes);
      sent.current = bytes;
    }
  }, [enabled, send]);
  useEffect(() => {
    if (!enabled) {
      sent.current = null;
      return;
    }
    report();
    let ticks = 0;
    const timer = setInterval(() => {
      report();
      if (++ticks % QUALITY_EVERY === 0) sendQuality?.();
    }, 10000);
    return () => {
      report();
      clearInterval(timer);
    };
  }, [enabled, report, sendQuality]);
  return report;
}
