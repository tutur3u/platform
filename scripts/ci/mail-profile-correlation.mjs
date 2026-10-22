const stages = new Set([
  'proxy',
  'profile actor',
  'profile bindings',
  'profile creator',
  'profile worlds',
  'layout session',
  'layout workspace',
  'layout invitation',
  'layout workspaces',
  'layout navigation',
  'resolve actor',
  'resolve bindings',
  'read world',
  'D1 world access',
  'D1 world record',
  'D1 entries',
  'Supabase member names',
  'D1 collaborators',
  'D1 creators',
  'Supabase eligible members',
]);
const idPattern = /^[a-f0-9]{32}$/u;
const unknown = (reason) => ({
  state: 'unknown',
  reason,
  rendererCompletion: 'unknown',
});
const marker = '[lettin-profile-read] ';

export function parseProfileReadEvents(text, truncated = false) {
  if (truncated || typeof text !== 'string' || Buffer.byteLength(text) > 131072)
    return { state: 'unknown', events: [] };
  const events = [];
  for (const line of text.split('\n')) {
    if (!line.includes('[lettin-profile-read]')) continue;
    if (
      !line.startsWith(marker) ||
      !text.endsWith('\n') ||
      events.length >= 512
    )
      return { state: 'unknown', events: [] };
    try {
      const event = JSON.parse(line.slice(marker.length));
      if (
        !event ||
        Object.keys(event).sort().join(',') !==
          'elapsedMs,event,requestId,stage,version' ||
        event.version !== 1 ||
        typeof event.requestId !== 'string' ||
        !idPattern.test(event.requestId) ||
        !stages.has(event.stage) ||
        !['entry', 'started', 'completed', 'failed'].includes(event.event) ||
        (event.stage === 'proxy') !== (event.event === 'entry') ||
        !Number.isSafeInteger(event.elapsedMs) ||
        event.elapsedMs < 0 ||
        event.elapsedMs > 86400000
      )
        return { state: 'unknown', events: [] };
      events.push(event);
    } catch {
      return { state: 'unknown', events: [] };
    }
  }
  return { state: 'observed', events };
}

// Attribution uses the main document's response ID, never result position or log order.
export function joinProfileReadEvents(results, parsed) {
  if (!Array.isArray(results)) return results;
  const candidates = (result) => {
    const nav = result.navigationDiagnostics;
    if (nav?.state !== 'observed' || nav.record?.truncated !== false) return [];
    return nav.record.hops.filter(
      (hop) =>
        hop.route === 'profile' &&
        hop.status === 200 &&
        hop.targetRoute === 'unavailable'
    );
  };
  const ids = results.flatMap((result) =>
    candidates(result).map((hop) => hop.requestId)
  );
  return results.map((result) => {
    if (!result.navigationDiagnostics) return result;
    let correlation = unknown('missing-or-ambiguous-document');
    const hops = candidates(result);
    if (
      hops.length === 1 &&
      typeof hops[0].requestId === 'string' &&
      idPattern.test(hops[0].requestId) &&
      ids.filter((id) => id === hops[0].requestId).length === 1
    ) {
      const requestId = hops[0].requestId;
      const events =
        parsed?.state === 'observed'
          ? parsed.events.filter((event) => event.requestId === requestId)
          : [];
      correlation = unknown('missing-truncated-or-ambiguous-events');
      const entries = events.filter((event) => event.event === 'entry');
      const reads = events.filter((event) => event.event !== 'entry');
      const seen = new Set();
      let valid =
        entries.length === 1 && events[0] === entries[0] && reads.length > 0;
      const observations = [];
      for (const event of reads) {
        const key = `${event.stage}:${event.event}`;
        if (seen.has(key)) valid = false;
        seen.add(key);
        if (event.event !== 'started' && !seen.has(`${event.stage}:started`))
          valid = false;
        if (
          seen.has(`${event.stage}:failed`) &&
          seen.has(`${event.stage}:completed`)
        )
          valid = false;
        observations.push({
          stage: event.stage,
          event: event.event,
          elapsedMs: event.elapsedMs,
        });
      }
      if (valid)
        correlation = {
          state: 'attributed',
          requestId,
          observations,
          rendererCompletion: 'unknown',
        };
    }
    return { ...result, readCorrelation: correlation };
  });
}
