export const EMAIL_CLAIM_SIZE = 20;
export const EMAIL_DRAIN_MAX_BATCHES = 5;
export const EMAIL_DRAIN_BUDGET_MS = 30_000;

type StopReason = 'queue_empty' | 'batch_limit' | 'time_budget';

export class EmailQueueDrainError extends Error {
  constructor(
    readonly originalError: unknown,
    readonly processedEmails: number,
    readonly emailBatches: number,
    readonly stage: 'claim' | 'process'
  ) {
    super(
      originalError instanceof Error
        ? originalError.message
        : 'Email queue drain failed',
      { cause: originalError }
    );
    this.name = 'EmailQueueDrainError';
  }
}

/** Admission budget only: an admitted batch always settles before returning. */
export async function drainEmailQueue<T>(options: {
  claim: () => Promise<T[]>;
  processBatch: (rows: T[]) => Promise<void>;
  now?: () => number;
  maxBatches?: number;
  budgetMs?: number;
}) {
  const now = options.now ?? (() => performance.now());
  const maxBatches = options.maxBatches ?? EMAIL_DRAIN_MAX_BATCHES;
  const budgetMs = options.budgetMs ?? EMAIL_DRAIN_BUDGET_MS;
  if (
    !Number.isInteger(maxBatches) ||
    maxBatches < 1 ||
    !Number.isFinite(budgetMs) ||
    budgetMs <= 0
  ) {
    throw new Error('Invalid email queue drain budget');
  }
  const started = now();
  let processedEmails = 0;
  let emailBatches = 0;
  let emailDrainStopReason: StopReason = 'batch_limit';
  while (emailBatches < maxBatches) {
    if (now() - started >= budgetMs) {
      emailDrainStopReason = 'time_budget';
      break;
    }
    let rows: T[];
    try {
      rows = await options.claim();
    } catch (error) {
      throw new EmailQueueDrainError(
        error,
        processedEmails,
        emailBatches,
        'claim'
      );
    }
    if (rows.length === 0) {
      emailDrainStopReason = 'queue_empty';
      break;
    }
    // Never race a provider operation against the admission clock or abandon
    // a claimed lease because its batch crossed the elapsed-time budget.
    try {
      await options.processBatch(rows);
    } catch (error) {
      // Only previous fully settled batches are counted on a partial failure.
      throw new EmailQueueDrainError(
        error,
        processedEmails,
        emailBatches,
        'process'
      );
    }
    processedEmails += rows.length;
    emailBatches++;
    if (rows.length < EMAIL_CLAIM_SIZE) {
      emailDrainStopReason = 'queue_empty';
      break;
    }
  }
  return { processedEmails, emailBatches, emailDrainStopReason };
}

export async function processWithConcurrency<T>(
  items: T[],
  concurrency: number,
  process: (item: T) => Promise<void>
) {
  const queue = [...items];
  const workers = Array.from(
    { length: Math.min(concurrency, queue.length) },
    async () => {
      while (queue.length > 0) {
        const item = queue.shift();
        if (item) await process(item);
      }
    }
  );
  // A failed completion must not let this invocation abandon another provider
  // operation. Wait for every worker, then propagate the first worker failure.
  const settled = await Promise.allSettled(workers);
  const failure = settled.find((result) => result.status === 'rejected');
  if (failure?.status === 'rejected') throw failure.reason;
}
