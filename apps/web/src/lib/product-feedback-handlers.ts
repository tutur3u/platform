import { z } from 'zod';
import { StaffReadError } from '@/app/api/v1/product-feedback/staff-access';
import {
  openStaffOperation,
  type StaffOperationContext,
} from '@/app/api/v1/product-feedback/staff-operation';
import {
  FeedbackInputError,
  feedbackReceipt,
  normalizeFeedbackMedia,
  readFeedbackInput,
} from './product-feedback-input';

export const feedbackHeaders = {
  'Cache-Control': 'private, no-store',
  Vary: 'Authorization, Cookie',
};
export function feedbackFailure(status: number, retryAfter?: number) {
  const codes: Record<number, string> = {
    400: 'feedback_invalid_submission',
    401: 'feedback_unauthorized',
    403: 'feedback_forbidden',
    404: 'feedback_not_found',
    409: 'feedback_conflict',
    413: 'feedback_media_too_large',
    429: 'feedback_rate_limited',
  };
  return Response.json(
    { error: { code: codes[status] ?? 'feedback_unavailable' } },
    {
      status,
      headers: {
        ...feedbackHeaders,
        ...(retryAfter ? { 'Retry-After': String(retryAfter) } : {}),
      },
    }
  );
}
const result = z.discriminatedUnion('status', [
  z
    .object({ status: z.literal('accepted'), receipt: feedbackReceipt })
    .strict(),
  z.object({ status: z.literal('conflict') }).strict(),
  z
    .object({
      status: z.literal('limited'),
      retryAfter: z.number().int().min(1).max(3600),
    })
    .strict(),
]);
export interface FeedbackSubmissionDependencies {
  actor(request: Request, operation: StaffOperationContext): Promise<string>;
  enabled(): boolean;
  mediaEnabled(): boolean;
  verify(
    request: Request,
    token: string,
    operation: StaffOperationContext
  ): Promise<void>;
  submit(
    actor: string,
    input: {
      title: string;
      body: string;
      idempotencyKey: string;
      media?: string;
    },
    operation: StaffOperationContext
  ): Promise<unknown>;
}
export function createFeedbackSubmissionHandler(
  deps: FeedbackSubmissionDependencies
) {
  return async (request: Request) => {
    const operation = openStaffOperation(request, {
      durationMs: 15000,
      scope: 'feedback-intake-handler',
      provenance:
        'Authenticated feedback intake, bounded body and image, Turnstile 5s, SQL 3s; no replay',
    });
    if (!operation) return feedbackFailure(503);
    return operation.run(
      operation.phase(async (op) => {
        try {
          const actor = await deps.actor(request, op);
          if (!deps.enabled()) return feedbackFailure(503);
          const origin = request.headers.get('origin');
          if (
            (origin !== null && origin !== new URL(request.url).origin) ||
            (!request.headers.has('authorization') && origin === null) ||
            request.headers.get('sec-fetch-site') === 'cross-site'
          )
            return feedbackFailure(403);
          if (
            request.headers.get('content-type')?.split(';')[0]?.trim() !==
            'application/json'
          )
            return feedbackFailure(400);
          const input = await readFeedbackInput(request, op);
          if (input.media && !deps.mediaEnabled()) return feedbackFailure(503);
          await deps.verify(request, input.turnstileToken, op);
          op.check();
          const media = input.media
            ? await normalizeFeedbackMedia(input.media)
            : undefined;
          op.check();
          const stored = result.parse(
            await deps.submit(
              actor,
              {
                title: input.title,
                body: input.body,
                idempotencyKey: input.idempotencyKey,
                ...(media ? { media } : {}),
              },
              op
            )
          );
          if (stored.status === 'conflict') return feedbackFailure(409);
          if (stored.status === 'limited')
            return feedbackFailure(429, stored.retryAfter);
          return Response.json(stored.receipt, {
            status: 201,
            headers: feedbackHeaders,
          });
        } catch (error) {
          return feedbackFailure(
            error instanceof FeedbackInputError ||
              error instanceof StaffReadError
              ? error.status
              : 503
          );
        }
      }),
      (response) => response,
      feedbackFailure
    );
  };
}
