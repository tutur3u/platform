// Fits the serialized fleet snapshot under the Web body budget.

/** Under the route's 256 KiB body cap (413), with room to spare. */
export const BODY_BUDGET_BYTES = 240 * 1024;

const ACTIVE = new Set(['running', 'waiting', 'queued']);

/**
 * Fits the serialized snapshot under the body budget, giving up the least
 * useful data first: idle and failed lanes (lowest priority first), then
 * decision bodies, then optional lane detail, then active lanes, then the
 * newest decisions. Active lanes
 * go last because the phone counts each machine's active lanes from the list;
 * `counts` always keep every lane.
 */
export function fitToBudget(state, budget = BODY_BUDGET_BYTES) {
  const size = (value) => Buffer.byteLength(JSON.stringify(value), 'utf8');
  let fitted = state;
  let bytes = size(fitted);
  // Resolved history, release status and recovery go before anything v1 carries.
  for (const key of ['resolved', 'release', 'recovery']) {
    if (bytes <= budget || !(key in fitted)) continue;
    const { [key]: _dropped, ...rest } = fitted;
    fitted = rest;
    bytes = size(fitted);
  }
  if (
    bytes > budget &&
    fitted.machines?.some((machine) => machine.todayOutcomes)
  ) {
    fitted = {
      ...fitted,
      machines: fitted.machines.map(
        ({ todayOutcomes: _todayOutcomes, ...machine }) => machine
      ),
    };
    bytes = size(fitted);
  }
  // Drops lanes `keep` rejects from the low-priority end until it fits.
  const trimLanes = (keep) => {
    while (bytes > budget) {
      const lanes = fitted.lanes;
      const average = size(lanes) / Math.max(1, lanes.length);
      let drop = Math.max(1, Math.ceil((bytes - budget) / average));
      const kept = [];
      for (let i = lanes.length - 1; i >= 0; i--) {
        if (drop > 0 && !keep(lanes[i])) {
          drop--;
          continue;
        }
        kept.push(lanes[i]);
      }
      if (kept.length === lanes.length) return;
      fitted = { ...fitted, lanes: kept.reverse() };
      bytes = size(fitted);
    }
  };
  if (bytes > budget) trimLanes((lane) => ACTIVE.has(lane.state));
  if (bytes > budget) {
    fitted = {
      ...fitted,
      decisions: fitted.decisions.map(({ body: _body, ...rest }) => rest),
    };
    bytes = size(fitted);
  }
  if (bytes > budget) {
    // Optional lane detail goes before any active lane does.
    fitted = {
      ...fitted,
      lanes: fitted.lanes.map(
        ({
          project: _project,
          provider: _provider,
          model: _model,
          parentId: _parentId,
          startedAt: _startedAt,
          ...lane
        }) => lane
      ),
    };
    bytes = size(fitted);
  }
  if (bytes > budget) trimLanes(() => false);
  while (bytes > budget && fitted.decisions.length > 0) {
    // The newest login request goes first, then the newest ask, and secret
    // requests last: a dropped one would expire unanswered.
    const decisions = fitted.decisions;
    let drop = decisions.findLastIndex((d) => d.kind === 'login');
    if (drop < 0) drop = decisions.findLastIndex((d) => d.kind !== 'secret');
    if (drop < 0) drop = decisions.length - 1;
    fitted = {
      ...fitted,
      decisions: decisions.filter((_, index) => index !== drop),
    };
    bytes = size(fitted);
  }
  return {
    state: fitted,
    bytes,
    droppedLanes: state.lanes.length - fitted.lanes.length,
  };
}
