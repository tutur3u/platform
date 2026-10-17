let ordinal = 0;
const LIMIT = 2_147_483_647;
function bounded(value: number): number {
  return Number.isFinite(value)
    ? Math.min(LIMIT, Math.max(0, Math.round(value)))
    : LIMIT;
}
function version(value: string | undefined): string | null {
  return value &&
    /^\d{1,4}\.\d{1,4}\.\d{1,4}(?:[-+][a-zA-Z0-9.]{1,32})?$/.test(value)
    ? value
    : null;
}
function signalName(value: string | null) {
  return value === null ||
    value === 'SIGKILL' ||
    value === 'SIGTERM' ||
    value === 'SIGINT' ||
    value === 'SIGABRT'
    ? value
    : 'other';
}

export function metadataDiagnostic() {
  if (
    process.env.CI !== 'true' ||
    process.env.TTR_DOCKER_METADATA_DIAGNOSTIC !== '1'
  ) {
    return null;
  }
  const started = performance.now();
  const elapsed = () => bounded(performance.now() - started);
  ordinal = Math.min(LIMIT, ordinal + 1);
  const record: {
    schema: string;
    ordinal: number;
    runtime: string;
    nodeVersion: string | null;
    bunVersion: string | null;
    elapsedMs: number;
    spawnMs: number | null;
    firstStdoutMs: number | null;
    firstStdoutBytes: number | null;
    stdoutBytes: number;
    errorMs: number | null;
    exitMs: number | null;
    closeMs: number | null;
    deadlineMs: number | null;
    callbackLatenessMs: number | null;
    killResult: boolean | null;
    spawnFailure: 'not-found' | 'permission-denied' | 'other' | null;
    exitCode: number | null;
    signal: ReturnType<typeof signalName>;
  } = {
    schema: 'ttr-docker-metadata-v1',
    ordinal,
    runtime: process.versions.bun ? 'bun' : 'node',
    nodeVersion: version(process.versions.node),
    bunVersion: version(process.versions.bun),
    elapsedMs: 0,
    spawnMs: null,
    firstStdoutMs: null,
    firstStdoutBytes: null,
    stdoutBytes: 0,
    errorMs: null,
    exitMs: null,
    closeMs: null,
    deadlineMs: null,
    callbackLatenessMs: null,
    killResult: null,
    spawnFailure: null,
    exitCode: null,
    signal: null,
  };
  let settled = false;
  let deadlineDue = started;
  return {
    spawn() {
      record.spawnMs ??= elapsed();
    },
    stdout(chunk: unknown) {
      const bytes = Buffer.isBuffer(chunk)
        ? chunk.byteLength
        : typeof chunk === 'string'
          ? Buffer.byteLength(chunk)
          : 0;
      record.firstStdoutMs ??= elapsed();
      record.firstStdoutBytes ??= bounded(bytes);
      record.stdoutBytes = bounded(record.stdoutBytes + bytes);
    },
    error(classification: NonNullable<typeof record.spawnFailure>) {
      record.errorMs ??= elapsed();
      record.spawnFailure = classification;
    },
    exit(code: number | null, signal: string | null) {
      record.exitMs ??= elapsed();
      record.exitCode =
        code !== null && Number.isInteger(code) && Math.abs(code) <= LIMIT
          ? code
          : null;
      record.signal = signalName(signal);
    },
    close() {
      record.closeMs ??= elapsed();
    },
    arm(timeoutMs: number) {
      deadlineDue = performance.now() + timeoutMs;
    },
    deadline() {
      record.deadlineMs = elapsed();
      record.callbackLatenessMs = bounded(performance.now() - deadlineDue);
    },
    kill(killed: boolean) {
      record.killResult = killed === true;
    },
    settle() {
      if (settled) return;
      settled = true;
      record.elapsedMs = elapsed();
      try {
        console.error(JSON.stringify(record));
      } catch {
        // Diagnostic sink failures must not change metadata settlement.
      }
    },
  };
}
