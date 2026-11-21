// Evaluation of a production Web deployment marker's status history.
//
// GitHub marks an older deployment `inactive` as soon as a newer deployment in
// the same environment succeeds. A rerun records a second marker for the same
// SHA, so the newest status of the first can be `inactive` even though the
// marker was recorded as a success. `inactive` rows are therefore skipped: the newest remaining status
// must be a success, and a newer deployment of a different SHA in the same
// environment means the production head has moved past the marker.
import { readFileSync } from 'node:fs';

const time = (value) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const newestFirst = (a, b) =>
  time(b?.created_at) - time(a?.created_at) || (b?.id ?? 0) - (a?.id ?? 0);

/** Newest status that is not an automatic `inactive` transition. */
export function effectiveMarkerStatus(statuses) {
  if (!Array.isArray(statuses)) return undefined;
  return statuses
    .filter((status) => status && typeof status === 'object')
    .filter((status) => status.state !== 'inactive')
    .sort(newestFirst)[0];
}

/**
 * True when a different SHA was deployed to the environment after the marker.
 * `environmentDeployments` is the newest-first first page of the environment's
 * deployments. Rows above the marker are the deployments newer than it, so the
 * answer is only trustworthy when the page is ordered by non-increasing
 * created_at and contains the marker; anything else is unproven.
 */
export function markerSuperseded({ marker, environmentDeployments }) {
  if (!marker || !Array.isArray(environmentDeployments)) return true;
  const rows = environmentDeployments;
  if (rows.some((row) => !Number.isFinite(Date.parse(row?.created_at))))
    return true;
  if (
    rows.some(
      (row, index) =>
        index > 0 && time(rows[index - 1].created_at) < time(row.created_at)
    )
  )
    return true;
  const position = rows.findIndex((row) => row.id === marker.id);
  if (position < 0) return true;
  return rows.slice(0, position).some((row) => row.sha !== marker.sha);
}

export function evaluateMarker({
  statuses,
  marker,
  environmentDeployments,
  targetSha,
}) {
  const effective = effectiveMarkerStatus(statuses);
  const state = effective?.state ?? 'missing';
  if (!marker || marker.sha !== targetSha)
    return { accepted: false, state, reason: 'sha-mismatch' };
  if (state !== 'success')
    return { accepted: false, state, reason: 'no-current-success' };
  if (markerSuperseded({ marker, environmentDeployments }))
    return { accepted: false, state, reason: 'superseded' };
  return { accepted: true, state, reason: 'success' };
}

const read = (file) => JSON.parse(readFileSync(file, 'utf8'));

if (import.meta.url === `file://${process.argv[1]}`) {
  const {
    MARKER_STATUSES_FILE,
    MARKER_DEPLOYMENTS_FILE,
    MARKER_DEPLOYMENT_ID,
  } = process.env;
  const targetSha = process.env.TARGET_SHA;
  let verdict;
  try {
    const deployments = read(MARKER_DEPLOYMENTS_FILE);
    const marker = Array.isArray(deployments)
      ? deployments.find((item) => String(item?.id) === MARKER_DEPLOYMENT_ID)
      : undefined;
    verdict = evaluateMarker({
      statuses: read(MARKER_STATUSES_FILE),
      marker,
      environmentDeployments: deployments,
      targetSha,
    });
  } catch {
    verdict = { accepted: false, state: 'missing', reason: 'unreadable' };
  }
  process.stdout.write(`${JSON.stringify(verdict)}\n`);
}
