export const MAIL_READ_CALL_TIMEOUT_MS = 4_000;
export const MAIL_READ_REQUEST_TIMEOUT_MS = 12_000;
export const MAIL_READ_RETRY_AFTER_SECONDS = 5;

export class MailReadTimeout extends Error {
  constructor(public readonly stage: string) {
    super('Mail read timed out');
    this.name = 'MailReadTimeout';
  }
}

export class MailReadBudget {
  private readonly controller = new AbortController();

  readonly check = () => this.controller.signal.throwIfAborted();

  async run<T>(
    stage: string,
    work: () => Promise<T>,
    timeoutMs = MAIL_READ_CALL_TIMEOUT_MS
  ): Promise<T> {
    const signal = this.controller.signal;
    signal.throwIfAborted();
    const timer = setTimeout(
      () => this.controller.abort(new MailReadTimeout(stage)),
      timeoutMs
    );
    let onAbort: (() => void) | undefined;
    const aborted = new Promise<never>((_, reject) => {
      onAbort = () => reject(signal.reason);
      signal.addEventListener('abort', onAbort, { once: true });
    });
    try {
      return await Promise.race([aborted, work()]);
    } finally {
      clearTimeout(timer);
      if (onAbort) signal.removeEventListener('abort', onAbort);
    }
  }

  readonly fetch: typeof globalThis.fetch = (input, init) =>
    this.run('supabase', () => {
      const callerSignal =
        init?.signal ?? (input instanceof Request ? input.signal : undefined);
      const signal = callerSignal
        ? AbortSignal.any([callerSignal, this.controller.signal])
        : this.controller.signal;
      return globalThis.fetch(input, { ...init, signal });
    });

  close() {
    this.controller.abort();
  }
}
