// Splits terminal lane outcomes so the "failed" count only holds failures
// nobody has picked up again. A failed lane is superseded when a later lane
// does the same work: a retry, a re-review round or a duplicate launch on any
// machine. See apps/docs/platform/features/mobile-mastermind.mdx#fleet-sync.

/** Words that mark another attempt at the same work, not different work. */
const ATTEMPT_WORDS =
  /\b(?:retry|retried|retrying|again|redo|rerun|re-run|resume[ds]?|resuming|continue[ds]?|continuing|follow-?up)\b/g;
/** Attempt counters: `round 3`, `attempt 2`, `take 2`, `pass 2`. */
const ATTEMPT_COUNTERS = /\b(?:round|attempt|take|pass|try)\s*#?\d+\b/g;
const MIN_STEM_TOKENS = 3;

/**
 * The work a lane title names, as a token set: lowercased, without bracket
 * tags, attempt words and counters, with `re-review` read as `review`.
 * Parentheticals drop their words but keep any token with a digit, and
 * numbers that are not attempt counters (slice 3, N-175, R2) stay, so
 * "slice 3" and "(slice 4)" remain different work.
 */
export function laneStem(title) {
  const text = String(title ?? '')
    .toLowerCase()
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(ATTEMPT_COUNTERS, ' ')
    .replace(
      /\(([^)]*)\)/g,
      (_, inner) =>
        ` ${inner
          .split(/[^\p{L}\p{N}]+/u)
          .filter((token) => /\d/.test(token))
          .join(' ')} `
    )
    .replace(/\bre-(?=[a-z])/g, '')
    .replace(ATTEMPT_WORDS, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
  return text ? text.split(' ') : [];
}

/**
 * Same work: the same set of at least three stem words. Equality keeps the
 * relation transitive, so a chain of near matches never clears a failure
 * that is not the same work as its successor.
 */
export function sameWork(a, b) {
  const left = new Set(a);
  const right = new Set(b);
  if (left.size < MIN_STEM_TOKENS || left.size !== right.size) return false;
  return [...left].every((token) => right.has(token));
}

/**
 * Marks superseded failed lanes in place. Each entry is
 * `{ title, lane, projectKey?, attemptAt? }` with the raw title; attempts
 * order by `attemptAt` (when the run ended), else the lane's update time. A failed lane with a
 * strictly later same-work lane in the same project (a lane without a
 * project only matches another without one) that was not itself cancelled
 * becomes `idle` with a `resolution`: `recovered` when the newest
 * attempt did not fail, `cancelled` (a duplicate) when it failed too, so one
 * piece of work counts as at most one failure.
 */
export function supersedeFailures(entries) {
  const projectOf = (entry) => entry.projectKey ?? entry.lane.project ?? null;
  const at = (entry) => entry.attemptAt ?? entry.lane.updatedAt;
  const stems = entries.map((entry) => laneStem(entry.title));
  const newest = (index) => {
    const self = entries[index];
    let best;
    for (let other = 0; other < entries.length; other++) {
      if (other === index) continue;
      const candidate = entries[other];
      if (
        projectOf(self) !== projectOf(candidate) ||
        candidate.lane.resolution === 'cancelled' ||
        at(candidate) <= at(self) ||
        !sameWork(stems[index], stems[other])
      )
        continue;
      if (
        !best ||
        at(candidate) > at(best) ||
        (at(candidate) === at(best) && candidate.lane.id > best.lane.id)
      )
        best = candidate;
    }
    return best?.lane;
  };
  const marks = entries.map((entry, index) => {
    if (entry.lane.state !== 'failed') return undefined;
    const successor = newest(index);
    return (
      successor && (successor.state === 'failed' ? 'cancelled' : 'recovered')
    );
  });
  entries.forEach((entry, index) => {
    if (!marks[index]) return;
    entry.lane.state = 'idle';
    entry.lane.resolution = marks[index];
  });
}
