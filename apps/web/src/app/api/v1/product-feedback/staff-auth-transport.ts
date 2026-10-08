import type { StaffOperationContext } from './staff-operation';

const unavailable = () => new TypeError('feedback_staff_transport_failed');
type Outcome =
  | { readonly kind: 'no-response' }
  | { readonly kind: 'owned-response'; readonly response: Response };

/** One invocation owns allocation, its reader and the true release acknowledgement. */
class Invocation {
  private readonly controller = new AbortController();
  private readonly releases: (() => void)[] = [];
  private readonly sources: AbortSignal[] = [];
  private readonly assign: (outcome: Outcome) => void;
  private outcome: Outcome | undefined;
  private body: ReadableStream<Uint8Array> | null | undefined;
  private reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  private pendingRead: Promise<void> | undefined;
  private outward: ReadableStreamDefaultController<Uint8Array> | undefined;
  private outwardClosed = false;
  private cleanupPromise: Promise<void> | undefined;
  private unsafeRelease = false;
  private processingResponse = false;
  private readonly aborted = () => {
    this.errorOutward();
    if (this.outcome && !this.processingResponse)
      void this.close().catch(() => {});
  };

  constructor(private readonly operation: StaffOperationContext) {
    this.assign = operation.resource<Outcome>(() => this.close());
  }

  private check() {
    this.operation.check();
    if (this.sources.some((signal) => signal.aborted)) {
      throw unavailable();
    }
  }

  private record(outcome: Outcome) {
    this.outcome = outcome;
    this.assign(outcome);
  }

  private errorOutward() {
    if (this.outwardClosed) return;
    this.outwardClosed = true;
    try {
      this.outward?.error(unavailable());
    } catch {
      // Required cleanup remains owned even if the outward controller throws.
    }
  }

  private releaseBridges(): boolean {
    let failed = false;
    for (const release of this.releases.splice(0)) {
      try {
        release();
      } catch {
        failed = true;
      }
    }
    return failed;
  }

  private bridge(signal: AbortSignal) {
    const abort = () => {
      try {
        this.controller.abort();
      } catch {
        this.unsafeRelease = true;
        this.aborted();
      }
    };
    // Retain removal when an instrumented registration installs then throws.
    this.releases.push(() => signal.removeEventListener('abort', abort));
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
  }

  private prepare(input: RequestInfo | URL, init?: RequestInit): RequestInit {
    const external =
      init?.signal !== undefined
        ? init.signal
        : input instanceof Request
          ? input.signal
          : null;
    this.sources.push(this.operation.signal);
    if (external && external !== this.operation.signal)
      this.sources.push(external);
    this.releases.push(() =>
      this.controller.signal.removeEventListener('abort', this.aborted)
    );
    this.controller.signal.addEventListener('abort', this.aborted, {
      once: true,
    });
    for (const signal of this.sources) this.bridge(signal);
    // This selected contract preserves SDK plain-init values and input identity.
    const derived = { ...init, signal: this.controller.signal };
    this.check();
    return derived;
  }

  private noResponse() {
    this.record({ kind: 'no-response' });
    // Install and start release BEFORE any rejection checkpoint can throw.
    void this.close().catch(() => {});
  }

  async fetch(
    fetcher: typeof globalThis.fetch,
    input: RequestInfo | URL,
    init?: RequestInit
  ): Promise<Response> {
    let derived: RequestInit;
    try {
      derived = this.prepare(input, init);
    } catch (error) {
      this.noResponse();
      this.check();
      throw error;
    }
    let response: Response;
    try {
      // A dispatched pending fetch retains its slot until this await settles.
      response = await fetcher(input, derived);
    } catch (error) {
      this.noResponse();
      this.check();
      throw error;
    }
    // No response processing exception may reclassify this as no-response.
    this.record({ kind: 'owned-response', response });
    this.processingResponse = true;
    try {
      this.check();
      this.body = response.body;
      if (response.bodyUsed || this.body?.locked) {
        this.unsafeRelease = true;
        throw unavailable();
      }
      if (response.status === 0) {
        this.unsafeRelease = true;
        throw unavailable();
      }
      this.check();
      if (this.body === null) {
        await this.close(true);
        this.check();
        return response;
      }
      this.reader = this.body.getReader();
      this.check();
      const forwarded = new ReadableStream<Uint8Array>(
        {
          start: (controller) => {
            this.outward = controller;
          },
          pull: () => this.pull(),
          cancel: () => {
            this.outwardClosed = true;
            return this.close();
          },
        },
        { highWaterMark: 0 }
      );
      const result = new Response(forwarded, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
      for (const key of ['url', 'redirected', 'type'] as const) {
        Object.defineProperty(result, key, { value: response[key] });
      }
      Object.defineProperty(result, 'clone', {
        value: () => {
          throw new TypeError('feedback_staff_transport_clone_unsupported');
        },
      });
      this.check();
      return result;
    } catch (error) {
      this.processingResponse = false;
      this.errorOutward();
      void this.close().catch(() => {});
      throw error;
    } finally {
      this.processingResponse = false;
    }
  }

  private async pull(): Promise<void> {
    if (this.cleanupPromise || this.outwardClosed || this.pendingRead) return;
    try {
      this.check();
      const reader = this.reader;
      if (!reader) throw unavailable();
      // Install settlement before read can synchronously reenter abort cleanup.
      let settle!: () => void;
      const pending = new Promise<void>((resolve) => {
        settle = resolve;
      });
      this.pendingRead = pending;
      let result: ReadableStreamReadResult<Uint8Array>;
      try {
        // One default reader and one pending read, with no eager prefetch.
        result = await reader.read();
      } catch (error) {
        this.check();
        throw error;
      } finally {
        // Only actual read fulfillment, rejection or synchronous throw settles it.
        settle();
        if (this.pendingRead === pending) this.pendingRead = undefined;
      }
      this.check();
      if (this.cleanupPromise || this.outwardClosed) return;
      if (result.done) {
        await this.close(true);
        this.check();
      } else {
        this.check();
        this.outward?.enqueue(result.value);
      }
    } catch {
      this.errorOutward();
      void this.close().catch(() => {});
    }
  }

  private close(eof = false): Promise<void> {
    if (this.cleanupPromise) return this.cleanupPromise;
    let resolve!: () => void;
    let reject!: (error: unknown) => void;
    // Cache before cancel/remove/release can reenter through an abort callback.
    this.cleanupPromise = new Promise<void>((ok, fail) => {
      resolve = ok;
      reject = fail;
    });
    void this.cleanupPromise.catch(() => {});
    const finish = async () => {
      let failed = this.unsafeRelease;
      if (!eof) this.errorOutward();
      const waits: Promise<unknown>[] = [];
      const reader = this.reader;
      const pending = this.pendingRead;
      if (reader && !eof) {
        try {
          waits.push(Promise.resolve(reader.cancel()));
        } catch {
          failed = true;
        }
      } else if (!reader && this.outcome?.kind === 'owned-response') {
        // Closing may precede metadata or reader acquisition on a late response.
        try {
          const response = this.outcome.response;
          const body = this.body === undefined ? response.body : this.body;
          if (response.bodyUsed || body?.locked) failed = true;
          else if (body !== null) waits.push(Promise.resolve(body.cancel()));
        } catch {
          failed = true;
        }
      }
      // Consume cancel and read independently; cancel alone proves no read settlement.
      const cancellations = waits.map((wait) =>
        wait.then(
          () => {},
          () => {
            failed = true;
          }
        )
      );
      if (pending)
        cancellations.push(
          pending.then(
            () => {},
            () => {}
          )
        );
      if (this.releaseBridges()) failed = true;
      await Promise.all(cancellations);
      if (reader) {
        try {
          reader.releaseLock();
        } catch {
          failed = true;
        }
      }
      if (failed) throw unavailable();
      if (eof && this.outward && !this.outwardClosed) {
        this.check();
        this.outward.close();
        this.outwardClosed = true;
      }
    };
    void finish().then(resolve, () => reject(unavailable()));
    return this.cleanupPromise;
  }
}

/** Scoped SDK URL/plain-init transport; no retry, timer, credential or client mutation. */
export function createStaffAuthTransport(
  operation: StaffOperationContext,
  fetcher: typeof globalThis.fetch = globalThis.fetch
): typeof globalThis.fetch {
  return (input, init) => {
    operation.check();
    return new Invocation(operation).fetch(fetcher, input, init);
  };
}
