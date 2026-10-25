import { formatWithOptions } from 'node:util';

export class FixtureCheckError extends Error {
  readonly code: string;
  constructor(code: string) {
    super('Fixture check failed');
    this.code = code;
  }
}

export function check(ok: unknown, code: string): asserts ok {
  if (!ok) throw new FixtureCheckError(code);
}

/** Retained only in process memory; failures never interpolate inspected values. */
export class Capture {
  readonly records: Buffer[] = [];
  readonly forbidden: Buffer[] = [];
  bytes = 0;
  overflow = false;
  requests = 0;
  uploads = 0;
  logChunks = 0;

  add(value: Uint8Array | string) {
    const size =
      typeof value === 'string' ? Buffer.byteLength(value) : value.byteLength;
    if (this.bytes + size > 32 * 1024 * 1024) {
      this.overflow = true;
      throw new Error('CAPTURE_LIMIT');
    }
    const copy =
      typeof value === 'string' ? Buffer.from(value) : Buffer.from(value);
    this.records.push(copy);
    this.bytes += copy.length;
  }

  secret(bytes: Buffer) {
    this.forbidden.push(Buffer.from(bytes));
    for (const encoding of ['base64', 'base64url', 'hex'] as const)
      this.forbidden.push(Buffer.from(bytes.toString(encoding)));
    // Catch common truncated Buffer/array logging as well as complete values.
    const prefix = bytes.subarray(0, Math.min(30, bytes.length));
    if (prefix.length >= 16) {
      this.forbidden.push(Buffer.from(prefix));
      this.forbidden.push(Buffer.from(prefix.toString('base64')));
      this.forbidden.push(Buffer.from(prefix.toString('base64url')));
      this.forbidden.push(Buffer.from(prefix.toString('hex')));
      this.forbidden.push(
        Buffer.from(
          [...prefix]
            .map((byte) => byte.toString(16).padStart(2, '0'))
            .join(' ')
        )
      );
      this.forbidden.push(Buffer.from([...prefix].join(',')));
      this.forbidden.push(Buffer.from([...prefix].join(', ')));
    }
  }

  verify() {
    check(!this.overflow, 'CAPTURE_LIMIT');
    // Concatenation also checks a value split across console/stream writes.
    const combined = Buffer.concat(this.records);
    try {
      for (const needle of this.forbidden)
        check(!combined.includes(needle), 'SECRET_IN_CAPTURE');
    } finally {
      combined.fill(0);
    }
  }

  wipe() {
    for (const value of [...this.records, ...this.forbidden]) value.fill(0);
    this.records.length = 0;
    this.forbidden.length = 0;
  }
}

async function boundedBytes(body: ReadableStream<Uint8Array> | null) {
  if (!body) return Buffer.alloc(0);
  const reader = body.getReader();
  const chunks: Buffer[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return Buffer.concat(chunks);
      size += value.length;
      check(size <= 2 * 1024 * 1024, 'BACKEND_BODY_LIMIT');
      chunks.push(Buffer.from(value));
    }
  } finally {
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
    for (const chunk of chunks) chunk.fill(0);
  }
}

export function interceptLogs(capture: Capture) {
  const saved = new Map<string, unknown>();
  const target = console as unknown as Record<string, unknown>;
  for (const name of Object.keys(console)) {
    if (typeof target[name] !== 'function') continue;
    saved.set(name, target[name]);
    target[name] = (...args: unknown[]) => {
      capture.logChunks++;
      capture.add(
        formatWithOptions({ customInspect: false, getters: false }, ...args)
      );
    };
  }
  const stdout = process.stdout.write;
  const stderr = process.stderr.write;
  const write = (...args: unknown[]) => {
    capture.logChunks++;
    const value = args[0];
    if (typeof value === 'string' || value instanceof Uint8Array)
      capture.add(value);
    else capture.add('UNSUPPORTED_LOG_VALUE');
    const callback = args.find((arg) => typeof arg === 'function');
    if (typeof callback === 'function') queueMicrotask(() => callback());
    return true;
  };
  process.stdout.write = write as typeof stdout;
  process.stderr.write = write as typeof stderr;
  return () => {
    process.stdout.write = stdout;
    process.stderr.write = stderr;
    for (const [name, fn] of saved) target[name] = fn;
  };
}

export function interceptBackend(
  origin: string,
  capture: Capture,
  signal: AbortSignal
) {
  const original = globalThis.fetch;
  const replacement: typeof fetch = async (input, init) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    check(
      url.origin === origin && !url.username && !url.password,
      'BACKEND_ENDPOINT'
    );
    check(/^\/(rest|auth|storage)\/v1\//.test(url.pathname), 'BACKEND_PATH');
    check(++capture.requests <= 300, 'REQUEST_LIMIT');
    const body = await boundedBytes(request.clone().body);
    try {
      capture.add(body);
    } finally {
      body.fill(0);
    }
    if (
      request.method === 'POST' &&
      url.pathname.startsWith('/storage/v1/object/')
    )
      capture.uploads++;
    const response = await original(request, {
      redirect: 'error',
      signal: AbortSignal.any([
        signal,
        request.signal,
        AbortSignal.timeout(15000),
      ]),
    });
    check(
      !response.redirected &&
        (!response.url || new URL(response.url).origin === origin),
      'BACKEND_REDIRECT'
    );
    const bytes = await boundedBytes(response.clone().body);
    try {
      check(bytes.length <= 2 * 1024 * 1024, 'BACKEND_RESPONSE_LIMIT');
      capture.add(bytes);
    } finally {
      bytes.fill(0);
    }
    return response;
  };
  globalThis.fetch = replacement;
  return () => {
    globalThis.fetch = original;
  };
}
