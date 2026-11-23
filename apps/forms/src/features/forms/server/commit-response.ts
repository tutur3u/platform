import type { SupabaseClient } from '@tuturuuu/supabase';
import type { Database, Json } from '@tuturuuu/types';
import { z } from 'zod';

export type SharedFormAnswerRow = {
  question_id: string | null;
  question_title: string;
  question_type: string;
  answer_text: string | null;
  answer_json: Json | null;
};

export type SharedFormCommitInput = {
  form: {
    id: string;
    ws_id: string;
    access_mode: string;
    updated_at: string;
    open_at: string | null;
    close_at: string | null;
    max_responses: number | null;
  };
  shareLinkId: string;
  sessionId: string;
  respondentUserId: string | null;
  respondentEmail: string | null;
  lastSectionId: string | null;
  answers: SharedFormAnswerRow[];
};

const commitResultSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('submitted'),
    response_id: z.string(),
    submitted_at: z.string(),
    replayed: z.boolean(),
  }),
  z.object({
    kind: z.enum([
      'invalid',
      'not_found',
      'closed',
      'policy_changed',
      'limit',
      'conflict',
    ]),
  }),
]);

export type SharedFormCommitResult = z.infer<typeof commitResultSchema>;

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}

/**
 * Commits a share-link response, its answers and the session close in one
 * transaction. `commit_form_response` locks the form row before it checks the
 * response limit and one-response settings, so concurrent submissions cannot
 * overrun them. The commitment identifies this exact submission: a retry of
 * the same answers on a committed session replays instead of conflicting.
 */
export async function commitSharedFormResponse(
  adminClient: SupabaseClient<Database>,
  input: SharedFormCommitInput
): Promise<SharedFormCommitResult> {
  const commitment = await sha256Hex(
    JSON.stringify(['forms-share-response', input.sessionId, input.answers])
  );
  const { data, error } = await adminClient.rpc('commit_form_response', {
    p_submission: {
      ws_id: input.form.ws_id,
      form_id: input.form.id,
      share_link_id: input.shareLinkId,
      session_id: input.sessionId,
      commitment,
      policy_revision: input.form.updated_at,
      // The route verifies Turnstile before it commits; development mode
      // skips the remote check, as it does for every other Turnstile gate.
      proof: 'verified',
      access_mode: input.form.access_mode,
      respondent_user_id: input.respondentUserId,
      respondent_email: input.respondentEmail,
      snapshot_open_at: input.form.open_at,
      snapshot_close_at: input.form.close_at,
      snapshot_max_responses: input.form.max_responses,
      last_section_id: input.lastSectionId,
      metadata: {},
      answers: input.answers,
    },
  });
  if (error) throw new Error(error.message);
  const parsed = commitResultSchema.safeParse(data);
  if (!parsed.success)
    throw new Error('Form response commit was not confirmed');
  return parsed.data;
}
