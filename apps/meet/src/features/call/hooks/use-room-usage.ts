import { useEffect, useRef } from 'react';
import type { MediaDiagnostics } from '../lib/media-diagnostics';
export function useRoomUsage(
  telemetry: MediaDiagnostics | undefined,
  enabled: boolean,
  send: (id: string, bytes: number) => void
) {
  const id = useRef(crypto.randomUUID()),
    latest = useRef(telemetry);
  latest.current = telemetry;
  useEffect(() => {
    if (!enabled) return;
    const report = () => {
      const bytes = latest.current?.receivedBytesTotal;
      if (bytes !== undefined) send(id.current, bytes);
    };
    report();
    const timer = setInterval(report, 10000);
    return () => {
      report();
      clearInterval(timer);
    };
  }, [enabled, send]);
}
