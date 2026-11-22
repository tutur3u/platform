const IDLE_TIMEOUT_MS = 15_000;
// Each exec gets a private mount namespace, so the launcher's fresh /tmp and
// everything staged in it disappear when the exec ends.
export const LAUNCHER = [
  '/usr/bin/unshare',
  '--mount',
  '--propagation',
  'private',
  '/usr/bin/python3',
  '-I',
  '-S',
  '-B',
  '/usr/local/lib/playground/run.py',
];
const MAX_RESPONSE_BYTES = 14 * 1024 * 1024;
const MAX_CONSOLE_BYTES = 64 * 1024;

export interface GuestInput {
  command: string;
  files: { path: string; content: string }[];
  stdin?: string;
}

export type GuestResult = {
  exitCode: number;
  output: string;
  outcome: 'exited' | 'timeout' | 'output_limit' | 'sandbox_failed';
  files?: unknown;
};

function parseResult(value: unknown): GuestResult {
  if (
    !value ||
    typeof value !== 'object' ||
    !('exitCode' in value) ||
    typeof value.exitCode !== 'number' ||
    !Number.isInteger(value.exitCode) ||
    value.exitCode < 0 ||
    value.exitCode > 255 ||
    !('output' in value) ||
    typeof value.output !== 'string' ||
    new TextEncoder().encode(value.output).byteLength > MAX_CONSOLE_BYTES ||
    !('outcome' in value) ||
    (value.outcome !== 'exited' &&
      value.outcome !== 'timeout' &&
      value.outcome !== 'output_limit' &&
      value.outcome !== 'sandbox_failed')
  ) {
    throw new Error('Invalid Playground guest response');
  }
  return {
    exitCode: value.exitCode,
    output: value.output,
    outcome: value.outcome,
    ...('files' in value ? { files: value.files } : {}),
  };
}

export async function readGuestStream(
  stream: ReadableStream | null,
  maxBytes = MAX_RESPONSE_BYTES
): Promise<string> {
  if (!stream) throw new Error('Missing Playground guest output');
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let output = '';
  let bytes = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) return output + decoder.decode();
      if (!(next.value instanceof Uint8Array)) {
        throw new Error('Invalid Playground guest output chunk');
      }
      bytes += next.value.byteLength;
      if (bytes > maxBytes) {
        void reader.cancel().catch(() => {});
        throw new Error('Playground guest output limit exceeded');
      }
      output += decoder.decode(next.value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
}

// One owner calls this for a single newly claimed slot. Its deadline alarm and
// cancellation path must destroy a still-running guest before releasing the slot.
export async function runInFreshContainer(
  container: Container,
  input: GuestInput,
  deadline: number,
  signal?: AbortSignal,
  mayExecute: () => Promise<boolean> = async () => true
): Promise<GuestResult> {
  if (container.running) throw new Error('Playground slot is not clean');
  const image = container.images.toolchain;
  if (!image || signal?.aborted || Date.now() >= deadline) {
    throw new Error('Playground image unavailable or deadline passed');
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abort: (() => void) | undefined;
  let cancelled = false;
  let result: GuestResult;
  try {
    container.start({
      image,
      enableInternet: false,
      instance: 'standard-1',
    });
    const expiration = new Promise<never>((_, reject) => {
      abort = () => {
        cancelled = true;
        reject(new Error('Playground execution stopped'));
      };
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      timer = setTimeout(abort, Math.max(0, deadline - Date.now()));
    });
    const execution = (async () => {
      await container.setInactivityTimeout(IDLE_TIMEOUT_MS);
      if (
        cancelled ||
        Date.now() >= deadline ||
        !(await mayExecute()) ||
        cancelled ||
        Date.now() >= deadline
      ) {
        throw new Error('Playground execution stopped before dispatch');
      }
      const stdin = new Blob([JSON.stringify(input)]).stream();
      const process = await container.exec(LAUNCHER, {
        user: '0:0',
        stdin,
        stderr: 'ignore',
      });
      const [output, exitCode] = await Promise.all([
        readGuestStream(process.stdout),
        process.exitCode,
      ]);
      if (exitCode !== 0) throw new Error('Playground guest launcher failed');
      return parseResult(JSON.parse(output));
    })();
    // When cancellation wins, destroying the guest rejects the losing branch.
    execution.catch(() => {});
    result = await Promise.race([expiration, execution]);
  } finally {
    clearTimeout(timer);
    if (abort) signal?.removeEventListener('abort', abort);
    if (container.running) await container.destroy();
  }
  if (container.running) throw new Error('Playground teardown unconfirmed');
  return result;
}
