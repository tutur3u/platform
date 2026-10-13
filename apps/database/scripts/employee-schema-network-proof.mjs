/** Process only fixed event fields; do not retain Docker labels or private diagnostics. */
export function createNetworkEventProof(projectId, networkId) {
  const diagnostics = createEmployeeNetworkDiagnostics();
  const containers = new Map();
  const connections = new Map();
  let failed = false,
    events = 0,
    bytes = 0;
  return {
    accept(line) {
      bytes += Buffer.byteLength(line);
      events++;
      if (bytes > 16 * 1024 * 1024 || events > 10000) {
        diagnostics.record('event-budget');
        failed = true;
        return;
      }
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        diagnostics.record('event-json-malformed');
        failed = true;
        return;
      }
      const id = event.Actor?.ID,
        attrs = event.Actor?.Attributes;
      if (
        event.Type === 'network' &&
        ['connect', 'disconnect'].includes(event.Action) &&
        /^[a-f0-9]{64}$/.test(attrs?.container ?? '')
      ) {
        const set = connections.get(attrs.container) ?? new Set();
        if (event.Action === 'connect') set.add(id);
        else set.delete(id);
        connections.set(attrs.container, set);
        if (containers.has(attrs.container) && id !== networkId)
          diagnostics.record('foreign-attachment', events);
        if (containers.has(attrs.container) && id !== networkId) failed = true;
      }
      if (
        event.Type !== 'container' ||
        attrs?.['com.supabase.cli.project'] !== projectId
      )
        return;
      if (!/^[a-f0-9]{64}$/.test(id ?? '')) {
        diagnostics.record('owned-id-invalid', events);
        failed = true;
        return;
      }
      if (event.Action === 'create') {
        if (containers.has(id)) {
          diagnostics.record('duplicate-create', events);
          failed = true;
          return;
        }
        if (
          !/^ghcr\.io\/supabase\/[a-z0-9_-]+(?::[A-Za-z0-9._-]+|@sha256:[a-f0-9]{64})$/.test(
            attrs.image ?? ''
          )
        ) {
          diagnostics.record('image-denied', events);
          failed = true;
        }
        containers.set(id, { id, image: attrs.image, started: false });
      } else if (event.Action === 'start') {
        const container = containers.get(id),
          set = connections.get(id);
        if (!container || !set || set.size !== 1 || !set.has(networkId)) {
          diagnostics.record('start-without-sole-attachment', events);
          failed = true;
        } else container.started = true;
      } else if (event.Action === 'destroy' && !containers.has(id)) {
        diagnostics.record('unknown-destroy', events);
        failed = true;
      }
    },
    result() {
      return {
        qualified:
          !failed &&
          containers.size > 0 &&
          [...containers.values()].every((item) => item.started) &&
          [...containers.values()].some((item) =>
            /^ghcr\.io\/supabase\/postgres-meta[:@]/.test(item.image ?? '')
          ),
        networkId,
        containerIds: [...containers.keys()].sort(),
        images: [
          ...new Set([...containers.values()].map((item) => item.image)),
        ].sort(),
      };
    },
    diagnostics(complete = false, destroyed) {
      return eventEmployeeNetworkDiagnostics(diagnostics.result(), {
        events,
        failed,
        containers,
        complete,
        destroyed,
      });
    },
    healthy() {
      return !failed;
    },
  };
}
/** Compare a complete authoritative history window to the live subscription. */
export function networkCoverageProof(
  live,
  history,
  ready,
  end,
  projectId,
  networkId
) {
  const window = (events) => {
    const anchor = (marker) =>
      events.findIndex(
        (event) =>
          event.Type === 'network' &&
          event.Action === 'create' &&
          event.Actor?.ID === marker.id &&
          event.Actor?.Attributes?.name === marker.name
      );
    const first = anchor(ready),
      last = anchor(end);
    if (first < 0 || last <= first) return null;
    const rows = events.slice(first + 1, last);
    const ids = new Set(
      rows
        .filter(
          (event) =>
            event.Type === 'container' &&
            event.Actor?.Attributes?.['com.supabase.cli.project'] === projectId
        )
        .map((event) => event.Actor.ID)
    );
    return rows.filter((event) =>
      event.Type === 'container'
        ? ids.has(event.Actor?.ID) &&
          ['create', 'start', 'destroy'].includes(event.Action)
        : event.Type === 'network' &&
          ids.has(event.Actor?.Attributes?.container) &&
          ['connect', 'disconnect'].includes(event.Action)
    );
  };
  const a = window(live),
    b = window(history);
  if (!a || !b || JSON.stringify(a) !== JSON.stringify(b))
    return {
      qualified: false,
      diagnostics: coverageEmployeeNetworkDiagnostics(
        !a || !b ? 'coverage-anchor-denied' : 'coverage-window-mismatch'
      ),
    };
  const proof = createNetworkEventProof(projectId, networkId);
  for (const event of b) proof.accept(JSON.stringify(event));
  const result = proof.result();
  const destroyed = new Set(
    b
      .filter(
        (event) => event.Type === 'container' && event.Action === 'destroy'
      )
      .map((event) => event.Actor.ID)
  );
  return {
    ...result,
    qualified:
      result.qualified && result.containerIds.every((id) => destroyed.has(id)),
    readyMarkerId: ready.id,
    endMarkerId: end.id,
    completeHistoryWindow: true,
    diagnostics: proof.diagnostics(true, destroyed),
  };
}
export function safeEvent(line) {
  const e = JSON.parse(line),
    a = e.Actor?.Attributes;
  return {
    Type: e.Type,
    Action: e.Action,
    Actor: {
      ID: e.Actor?.ID,
      Attributes: {
        container: a?.container,
        name: a?.name,
        image: a?.image,
        'com.supabase.cli.project': a?.['com.supabase.cli.project'],
      },
    },
  };
}

export const employeeNetworkPredicateFields = Object.freeze([
  'windowsAnchoredAndEqual',
  'eventValidationAccepted',
  'hasOwnedCreate',
  'allOwnedCreatesStarted',
  'hasRequiredPgmetaCreate',
  'allOwnedCreatesDestroyed',
  'observerStreamAccepted',
  'trailingLineEmpty',
  'observerDrained',
]);
export const employeeNetworkReasonCodes = Object.freeze([
  'coverage-anchor-denied',
  'coverage-window-mismatch',
  'coverage-evaluation-denied',
  'event-json-malformed',
  'event-budget',
  'owned-id-invalid',
  'duplicate-create',
  'image-denied',
  'foreign-attachment',
  'start-without-sole-attachment',
  'unknown-destroy',
  'owned-create-missing',
  'owned-create-unstarted',
  'pgmeta-create-missing',
  'owned-create-undestroyed',
  'barrier-denied',
  'history-read-denied',
  'history-parse-denied',
  'history-budget',
  'stream-error',
  'stream-early-close',
  'stream-deadline',
  'stream-budget',
  'stream-journal-budget',
  'stream-event-malformed',
  'trailing-line-present',
  'drain-unconfirmed',
]);
const diagnosticFailure = () => new Error('Employee network diagnostic denied');
const states = new Set(['PASS', 'FAIL', 'UNKNOWN']);
function exactDiagnosticKeys(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(value, key))
  )
    throw diagnosticFailure();
}
export function emptyEmployeeNetworkDiagnostics() {
  return {
    version: 1,
    predicates: Object.fromEntries(
      employeeNetworkPredicateFields.map((key) => [key, 'UNKNOWN'])
    ),
    reasons: [],
  };
}
export function parseEmployeeNetworkDiagnostics(value) {
  exactDiagnosticKeys(value, ['version', 'predicates', 'reasons']);
  exactDiagnosticKeys(value.predicates, employeeNetworkPredicateFields);
  if (
    value.version !== 1 ||
    !employeeNetworkPredicateFields.every((key) =>
      states.has(value.predicates[key])
    ) ||
    !Array.isArray(value.reasons) ||
    value.reasons.length > employeeNetworkReasonCodes.length ||
    Buffer.byteLength(JSON.stringify(value)) > 8192
  )
    throw diagnosticFailure();
  let previous = -1;
  for (const reason of value.reasons) {
    exactDiagnosticKeys(reason, ['code', 'count', 'witnessOrdinal']);
    const index = employeeNetworkReasonCodes.indexOf(reason.code);
    if (
      index <= previous ||
      !Number.isInteger(reason.count) ||
      reason.count < 1 ||
      reason.count > 10000 ||
      !(
        reason.witnessOrdinal === null ||
        (Number.isInteger(reason.witnessOrdinal) &&
          reason.witnessOrdinal >= 1 &&
          reason.witnessOrdinal <= 10000)
      )
    )
      throw diagnosticFailure();
    previous = index;
  }
  return {
    version: 1,
    predicates: { ...value.predicates },
    reasons: value.reasons.map((row) => ({ ...row })),
  };
}
export function createEmployeeNetworkDiagnostics() {
  const counts = new Map();
  return {
    record(code, ordinal = null, increment = 1) {
      if (
        !employeeNetworkReasonCodes.includes(code) ||
        !Number.isInteger(increment) ||
        increment < 1
      )
        throw diagnosticFailure();
      const row = counts.get(code) ?? { code, count: 0, witnessOrdinal: null };
      row.count = Math.min(10000, row.count + increment);
      if (
        row.witnessOrdinal === null &&
        Number.isInteger(ordinal) &&
        ordinal >= 1 &&
        ordinal <= 10000
      )
        row.witnessOrdinal = ordinal;
      counts.set(code, row);
    },
    result() {
      return {
        ...emptyEmployeeNetworkDiagnostics(),
        reasons: employeeNetworkReasonCodes
          .filter((key) => counts.has(key))
          .map((key) => ({ ...counts.get(key) })),
      };
    },
  };
}
function coverageEmployeeNetworkDiagnostics(code) {
  const reasons = createEmployeeNetworkDiagnostics();
  reasons.record(code);
  const result = reasons.result();
  result.predicates.windowsAnchoredAndEqual = 'FAIL';
  return result;
}
function eventEmployeeNetworkDiagnostics(
  reasons,
  { events, failed, containers, complete, destroyed }
) {
  const result = parseEmployeeNetworkDiagnostics(reasons),
    rows = [...containers.values()];
  const known = complete || events > 0;
  result.predicates.windowsAnchoredAndEqual = complete ? 'PASS' : 'UNKNOWN';
  result.predicates.eventValidationAccepted = known
    ? failed
      ? 'FAIL'
      : 'PASS'
    : 'UNKNOWN';
  result.predicates.hasOwnedCreate = rows.length
    ? 'PASS'
    : complete && !failed
      ? 'FAIL'
      : 'UNKNOWN';
  result.predicates.allOwnedCreatesStarted =
    rows.length && rows.every((row) => row.started)
      ? 'PASS'
      : complete && rows.length
        ? 'FAIL'
        : 'UNKNOWN';
  result.predicates.hasRequiredPgmetaCreate = rows.some((row) =>
    /^ghcr\.io\/supabase\/postgres-meta[:@]/.test(row.image ?? '')
  )
    ? 'PASS'
    : complete &&
        !result.reasons.some(
          (row) =>
            row.code === 'event-json-malformed' || row.code === 'event-budget'
        )
      ? 'FAIL'
      : 'UNKNOWN';
  result.predicates.allOwnedCreatesDestroyed =
    complete && rows.length
      ? rows.every((row) => destroyed.has(row.id))
        ? 'PASS'
        : 'FAIL'
      : 'UNKNOWN';
  const additional = createEmployeeNetworkDiagnostics();
  if (result.predicates.hasOwnedCreate === 'FAIL')
    additional.record('owned-create-missing');
  if (result.predicates.allOwnedCreatesStarted === 'FAIL')
    additional.record('owned-create-unstarted');
  if (result.predicates.hasRequiredPgmetaCreate === 'FAIL')
    additional.record('pgmeta-create-missing');
  if (result.predicates.allOwnedCreatesDestroyed === 'FAIL')
    additional.record('owned-create-undestroyed');
  return finalizeEmployeeNetworkDiagnostics(result, additional.result());
}
export function finalizeEmployeeNetworkDiagnostics(
  proof,
  observed,
  overrides = {}
) {
  const a =
    proof === undefined
      ? emptyEmployeeNetworkDiagnostics()
      : parseEmployeeNetworkDiagnostics(proof);
  const b = parseEmployeeNetworkDiagnostics(observed),
    accumulator = createEmployeeNetworkDiagnostics();
  if (
    !overrides ||
    typeof overrides !== 'object' ||
    Object.keys(overrides).some(
      (key) =>
        ![
          'observerStreamAccepted',
          'trailingLineEmpty',
          'observerDrained',
        ].includes(key)
    ) ||
    Object.values(overrides).some((value) => !states.has(value))
  )
    throw diagnosticFailure();
  for (const row of [...a.reasons, ...b.reasons])
    accumulator.record(row.code, row.witnessOrdinal, row.count);
  if (overrides.trailingLineEmpty === 'FAIL')
    accumulator.record('trailing-line-present');
  if (overrides.observerDrained === 'FAIL')
    accumulator.record('drain-unconfirmed');
  return parseEmployeeNetworkDiagnostics({
    version: 1,
    predicates: { ...a.predicates, ...overrides },
    reasons: accumulator.result().reasons,
  });
}
/** A legacy complete image set establishes only the pgmeta predicate. It cannot
 * reconstruct event validity, start/destroy chronology, stream state or drain. */
export function retainedEmployeeNetworkImageDiagnostics(images, complete) {
  const result = emptyEmployeeNetworkDiagnostics();
  if (complete !== true || !Array.isArray(images)) return result;
  if (
    !images.every(
      (image) =>
        typeof image === 'string' &&
        /^ghcr\.io\/supabase\/[a-z0-9_-]+(?::[A-Za-z0-9._-]+|@sha256:[a-f0-9]{64})$/.test(
          image
        )
    )
  )
    throw diagnosticFailure();
  result.predicates.hasRequiredPgmetaCreate = images.some((image) =>
    /^ghcr\.io\/supabase\/postgres-meta[:@]/.test(image)
  )
    ? 'PASS'
    : 'FAIL';
  if (result.predicates.hasRequiredPgmetaCreate === 'FAIL')
    result.reasons = [
      { code: 'pgmeta-create-missing', count: 1, witnessOrdinal: null },
    ];
  return result;
}
/** Strict collector boundary. Diagnostic vectors never replace qualified/drain booleans. */
export function collectEmployeeNetworkProof(actual) {
  const keys = [
    'qualified',
    'observerDrained',
    'networkId',
    'containerIds',
    'images',
    'readyMarkerId',
    'endMarkerId',
    'completeHistoryWindow',
    'diagnostics',
  ];
  if (
    !actual ||
    typeof actual !== 'object' ||
    Array.isArray(actual) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(actual)) ||
    Reflect.ownKeys(actual).some((key) => !keys.includes(key)) ||
    typeof actual.qualified !== 'boolean' ||
    typeof actual.observerDrained !== 'boolean' ||
    Buffer.byteLength(JSON.stringify(actual)) > 60000
  )
    throw diagnosticFailure();
  for (const key of ['networkId', 'readyMarkerId', 'endMarkerId'])
    if (Object.hasOwn(actual, key) && !/^[a-f0-9]{64}$/.test(actual[key]))
      throw diagnosticFailure();
  if (
    Object.hasOwn(actual, 'completeHistoryWindow') &&
    typeof actual.completeHistoryWindow !== 'boolean'
  )
    throw diagnosticFailure();
  if (
    Object.hasOwn(actual, 'containerIds') &&
    (!Array.isArray(actual.containerIds) ||
      new Set(actual.containerIds).size !== actual.containerIds.length ||
      actual.containerIds.some((id) => !/^[a-f0-9]{64}$/.test(id)))
  )
    throw diagnosticFailure();
  if (
    Object.hasOwn(actual, 'images') &&
    (!Array.isArray(actual.images) ||
      new Set(actual.images).size !== actual.images.length ||
      actual.images.some(
        (image) =>
          typeof image !== 'string' ||
          !/^ghcr\.io\/supabase\/[a-z0-9_-]+(?::[A-Za-z0-9._-]+|@sha256:[a-f0-9]{64})$/.test(
            image
          )
      ))
  )
    throw diagnosticFailure();
  const result = Object.fromEntries(
    keys
      .filter((key) => Object.hasOwn(actual, key) && key !== 'diagnostics')
      .map((key) => [key, actual[key]])
  );
  result.diagnostics = Object.hasOwn(actual, 'diagnostics')
    ? parseEmployeeNetworkDiagnostics(actual.diagnostics)
    : emptyEmployeeNetworkDiagnostics();
  return result;
}
