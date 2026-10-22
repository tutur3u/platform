import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { createRequestClient } from '@tuturuuu/supabase/request/server';
import {
  TurnstileError,
  verifyTurnstileToken,
} from '@tuturuuu/turnstile/server';
import { z } from 'zod';
import {
  resolveStaffActor,
  StaffReadError,
} from '@/app/api/v1/product-feedback/staff-access';
import { createStaffAuthTransport } from '@/app/api/v1/product-feedback/staff-auth-transport';
import {
  openStaffOperation,
  type StaffOperationContext,
} from '@/app/api/v1/product-feedback/staff-operation';
import type { FeedbackStaffDatabase } from '@/app/api/v1/product-feedback/staff-rpc';
import {
  createFeedbackSubmissionHandler,
  feedbackFailure,
  feedbackHeaders,
} from './product-feedback-handlers';
import { feedbackReceipt } from './product-feedback-input';

async function session(request: Request, operation: StaffOperationContext) {
  const authorization = request.headers.get('authorization');
  if (
    authorization !== null &&
    !/^Bearer (?!ttr_app_)\S+$/i.test(authorization)
  )
    throw new StaffReadError(401);
  const isolated =
    authorization === null
      ? request
      : new Request(request.url, {
          headers: { authorization },
          signal: operation.signal,
        });
  const client = await createRequestClient(isolated, {
    fetch: createStaffAuthTransport(operation),
  });
  operation.check();
  const { user, authError } = await resolveAuthenticatedSessionUser(client, {
    check: operation.check,
  });
  operation.check();
  if (authError) {
    const parsed = z
      .object({ status: z.number().optional() })
      .safeParse(authError);
    throw new StaffReadError(
      parsed.success && [401, 403].includes(parsed.data.status ?? 0) ? 401 : 503
    );
  }
  if (!user) throw new StaffReadError(401);
  const admin = await createAdminClient({
    noCookie: true,
    fetch: createStaffAuthTransport(operation),
  });
  const current = await admin.auth.admin.getUserById(user.id);
  operation.check();
  if (current.error) throw new StaffReadError(503);
  if (!current.data.user || current.data.user.id !== user.id)
    throw new StaffReadError(401);
  const ban = current.data.user.banned_until
    ? Date.parse(current.data.user.banned_until)
    : null;
  if (ban !== null && (!Number.isFinite(ban) || ban > Date.now()))
    throw new StaffReadError(403);
  return { actor: user.id, client };
}
export const submitProductFeedbackRequest = createFeedbackSubmissionHandler({
  actor: async (request, operation) =>
    (await session(request, operation)).actor,
  enabled: () => process.env.PRODUCT_FEEDBACK_SUBMISSION_ENABLED === 'true',
  mediaEnabled: () => process.env.PRODUCT_FEEDBACK_MEDIA_ENABLED === 'true',
  verify: async (request, token, operation) => {
    try {
      await verifyTurnstileToken(request, token, {
        devMode: false,
        includeRemoteIp: false,
        fetch: createStaffAuthTransport(operation),
        timeoutMs: 5000,
      });
    } catch (error) {
      if (error instanceof TurnstileError)
        throw new StaffReadError(error.code === 'not_configured' ? 503 : 403);
      throw error;
    }
  },
  submit: async (actor, input, operation) => {
    const client = await createAdminClient({
      noCookie: true,
      fetch: createStaffAuthTransport(operation),
    });
    operation.check();
    const args = {
      p_actor: actor,
      p_key: input.idempotencyKey,
      p_title: input.title,
      p_body: input.body,
    };
    const { data, error } = await client
      .rpc('submit_product_feedback_with_media', {
        ...args,
        p_media: input.media ?? null,
      })
      .abortSignal(operation.signal);
    operation.check();
    if (error) throw new StaffReadError(503);
    return data;
  },
});
export async function readProductFeedbackReceipt(
  request: Request,
  key: string
) {
  const operation = openStaffOperation(request, {
    durationMs: 10000,
    scope: 'feedback-intake-handler',
    provenance:
      'Original feedback receipt observation, current bearer/cookie actor and owner-only SQL RPC; no replay',
  });
  if (!operation) return feedbackFailure(503);
  return operation.run(
    operation.phase(async (op) => {
      try {
        const { client } = await session(request, op);
        if (!z.uuidv4().safeParse(key).success || new URL(request.url).search)
          return feedbackFailure(400);
        const { data, error } = await client
          .rpc('get_product_feedback_receipt', { p_key: key })
          .abortSignal(op.signal);
        op.check();
        if (error) throw new StaffReadError(503);
        return Response.json(
          { receipt: data === null ? null : feedbackReceipt.parse(data) },
          { headers: feedbackHeaders }
        );
      } catch (error) {
        return feedbackFailure(
          error instanceof StaffReadError ? error.status : 503
        );
      }
    }),
    (response) => response,
    feedbackFailure
  );
}
const mediaSchema = z
  .object({
    contentType: z.literal('image/webp'),
    data: z
      .string()
      .min(16)
      .max(699052)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  })
  .strict();
export async function readProductFeedbackStaffMedia(
  request: Request,
  id: string
) {
  const operation = openStaffOperation(request, {
    durationMs: 10000,
    scope: 'feedback-media-handler',
    provenance:
      'Private screenshot read: current staff Auth plus canonical SQL registry on every disclosure',
  });
  if (!operation) return feedbackFailure(503);
  return operation.run(
    operation.phase(async (op) => {
      try {
        const actor = await resolveStaffActor(request, op);
        if (
          process.env.PRODUCT_FEEDBACK_STAFF_INBOX_ENABLED !== 'true' ||
          process.env.PRODUCT_FEEDBACK_MEDIA_ENABLED !== 'true'
        )
          return feedbackFailure(503);
        if (!z.uuid().safeParse(id).success || new URL(request.url).search)
          return feedbackFailure(400);
        const client = await createAdminClient<FeedbackStaffDatabase>({
          noCookie: true,
          fetch: createStaffAuthTransport(op),
        });
        const { data, error } = await client
          .rpc('get_product_feedback_media_staff', { p_actor: actor, p_id: id })
          .abortSignal(op.signal);
        op.check();
        if (error) throw new StaffReadError(error.code === 'PT403' ? 403 : 503);
        return Response.json(
          { media: data === null ? null : mediaSchema.parse(data) },
          { headers: feedbackHeaders }
        );
      } catch (error) {
        return feedbackFailure(
          error instanceof StaffReadError ? error.status : 503
        );
      }
    }),
    (response) => response,
    feedbackFailure
  );
}
