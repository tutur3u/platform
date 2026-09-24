import { useCallback, useEffect, useRef } from 'react';
import type { MediaDiagnostics } from '../lib/media-diagnostics';
export function useRoomUsage(
  telemetry: MediaDiagnostics | undefined,
  enabled: boolean,
  send: (id: string, bytes: number) => void
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
    const timer = setInterval(report, 10000);
    return () => {
      report();
      clearInterval(timer);
    };
  }, [enabled, report]);
  return report;
}
