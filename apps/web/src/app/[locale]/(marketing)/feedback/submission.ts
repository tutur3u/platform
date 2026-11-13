import { InternalApiError } from '@tuturuuu/internal-api/client';
import type { ProductFeedbackSubmission } from '@tuturuuu/internal-api/product-feedback';
import { z } from 'zod';

export const categories = [
  'bug',
  'feedback',
  'feature',
  'improvement',
] as const;
export interface FeedbackDraft {
  category: (typeof categories)[number];
  title: string;
  details: string;
}
const receiptSchema = z
  .object({
    id: z.uuid(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();
type Receipt = z.infer<typeof receiptSchema>;
export type SubmissionState =
  | { kind: 'editing' }
  | { kind: 'sending' }
  | { kind: 'error'; code: 'invalid' | 'limited'; retryAt: number }
  | { kind: 'denied'; code: 'login' | 'forbidden' }
  | { kind: 'uncertain' }
  | { kind: 'checking' }
  | { kind: 'retry' }
  | { kind: 'success'; receipt: Receipt };
interface Dependencies {
  send(input: ProductFeedbackSubmission): Promise<unknown>;
  read(key: string): Promise<{ receipt: unknown }>;
  key(): string;
  now(): number;
  changed(state: SubmissionState): void;
}

export class FeedbackSubmission {
  state: SubmissionState = { kind: 'editing' };
  private attempt?: { title: string; body: string; idempotencyKey: string };
  constructor(private readonly deps: Dependencies) {}
  private transition(state: SubmissionState) {
    this.state = state;
    this.deps.changed(state);
  }
  async submit(draft: FeedbackDraft, token: string) {
    if (!['editing', 'error', 'retry'].includes(this.state.kind)) return;
    if (this.state.kind === 'error' && this.state.retryAt > this.deps.now())
      return;
    const title = draft.title.trim();
    const body = `Category: ${draft.category}\n\n${draft.details.trim()}`;
    if (
      !token ||
      !categories.includes(draft.category) ||
      !title ||
      [...title].length > 160 ||
      !draft.details.trim() ||
      [...body].length > 8000
    ) {
      this.transition({ kind: 'error', code: 'invalid', retryAt: 0 });
      return;
    }
    // A reconciled retry keeps the exact payload and key of the uncertain write.
    if (
      this.state.kind !== 'retry' &&
      (!this.attempt ||
        title !== this.attempt.title ||
        body !== this.attempt.body)
    ) {
      this.attempt = { title, body, idempotencyKey: this.deps.key() };
    }
    if (!this.attempt) return;
    this.transition({ kind: 'sending' });
    try {
      const receipt = receiptSchema.parse(
        await this.deps.send({
          ...this.attempt,
          turnstileToken: token,
        })
      );
      this.transition({ kind: 'success', receipt });
    } catch (error) {
      if (
        error instanceof InternalApiError &&
        [401, 403].includes(error.status)
      ) {
        this.transition({
          kind: 'denied',
          code: error.status === 401 ? 'login' : 'forbidden',
        });
      } else if (error instanceof InternalApiError && error.status === 429) {
        const seconds = error.retryAfter;
        const delay =
          typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0
            ? Math.min(3600, Math.ceil(seconds))
            : 60;
        this.transition({
          kind: 'error',
          code: 'limited',
          retryAt: this.deps.now() + delay * 1000,
        });
      } else if (
        error instanceof InternalApiError &&
        [400, 409, 413].includes(error.status)
      ) {
        this.transition({ kind: 'error', code: 'invalid', retryAt: 0 });
      } else {
        this.transition({ kind: 'uncertain' });
      }
    }
  }
  async check() {
    if (this.state.kind !== 'uncertain' || !this.attempt) return;
    this.transition({ kind: 'checking' });
    try {
      const result = await this.deps.read(this.attempt.idempotencyKey);
      if (result.receipt === null) {
        this.transition({ kind: 'retry' });
      } else {
        this.transition({
          kind: 'success',
          receipt: receiptSchema.parse(result.receipt),
        });
      }
    } catch (error) {
      if (
        error instanceof InternalApiError &&
        [401, 403].includes(error.status)
      ) {
        this.transition({
          kind: 'denied',
          code: error.status === 401 ? 'login' : 'forbidden',
        });
      } else {
        this.transition({ kind: 'uncertain' });
      }
    }
  }
}
