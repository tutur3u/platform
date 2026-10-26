/**
 * Records named stage durations and renders a `Server-Timing` header. The
 * header carries durations only, never identifiers or credentials, so clients
 * and traces can attribute Live startup latency to a server stage.
 */
export function createServerTiming(
  now: () => number = () => performance.now()
) {
  const started = now();
  const stages: Array<[string, number]> = [];

  const start = (name: string) => {
    const stageStart = now();
    return () => {
      stages.push([name, now() - stageStart]);
    };
  };

  return {
    start,
    async measure<T>(name: string, operation: () => Promise<T>): Promise<T> {
      const stop = start(name);
      try {
        return await operation();
      } finally {
        stop();
      }
    },
    header(): string {
      return [...stages, ['total', now() - started] as [string, number]]
        .map(([name, duration]) => `${name};dur=${duration.toFixed(1)}`)
        .join(', ');
    },
  };
}
