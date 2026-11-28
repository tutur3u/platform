import { AI_DATA_CONSENT_POLICY_VERSION } from '@tuturuuu/ai/chat/ai-data-consent';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { revokeUserAiTempAuthTokens } from '@tuturuuu/utils/ai-temp-auth';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { getDefaultAppSessionVerificationOptions } from '@/lib/api-auth-audiences';

const headers = { 'Cache-Control': 'private, no-store' };
const ROUTE = '/api/v1/users/me/ai-data-consent';

const bodySchema = z
  .object({
    granted: z.boolean(),
    source: z.enum([
      'mobile_mira_prompt',
      'mobile_settings',
      'web_mira_prompt',
      'web_settings',
    ]),
    policyVersion: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u),
  })
  .strict();

type ConsentRow = {
  granted: boolean;
  granted_at: string | null;
  policy_version: string | null;
  provider: string | null;
  withdrawn_at: string | null;
};

type PrivateRpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>
  ) => PromiseLike<{ data: unknown; error: { code?: string } | null }>;
};

async function privateRpc() {
  const admin = await createAdminClient({ noCookie: true });
  return (
    admin as unknown as { schema: (schema: 'private') => PrivateRpc }
  ).schema('private');
}

function toResponseBody(row: ConsentRow | null | undefined) {
  return {
    granted: row?.granted === true,
    provider: 'google_gemini',
    policyVersion: row?.policy_version ?? null,
    grantedAt: row?.granted_at ?? null,
    withdrawnAt: row?.withdrawn_at ?? null,
  };
}

const authOptions = {
  allowAppSessionAuth: [getDefaultAppSessionVerificationOptions(ROUTE)],
};

// The verified user's Mira AI data consent (Google Gemini). Mira routes refuse
// native-app requests without it; see
// apps/docs/platform/chat-safety-and-ai-consent.mdx.
export const GET = withSessionAuth(async (_req, { user }) => {
  const { data, error } = await (
    await privateRpc()
  ).rpc('get_ai_data_consent', { p_user_id: user.id });
  if (error) {
    console.error('AI data consent read failed', { code: error.code });
    return NextResponse.json(
      { message: 'Could not load the preference' },
      { status: 500, headers }
    );
  }
  const row = Array.isArray(data) ? (data[0] as ConsentRow) : null;
  return NextResponse.json(toResponseBody(row), { headers });
}, authOptions);

export const PUT = withSessionAuth(async (req, { user }) => {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { message: 'Invalid JSON body' },
      { status: 400, headers }
    );
  }
  const parsed = bodySchema.safeParse(body);
  // An Allow only counts for the disclosure the server currently shows, so a
  // grant for any other policy version is refused. A withdrawal always applies.
  if (
    !parsed.success ||
    (parsed.data.granted &&
      parsed.data.policyVersion !== AI_DATA_CONSENT_POLICY_VERSION)
  ) {
    return NextResponse.json(
      { message: 'Invalid request data' },
      { status: 400, headers }
    );
  }

  const { data, error } = await (
    await privateRpc()
  ).rpc('record_ai_data_consent', {
    p_user_id: user.id,
    p_granted: parsed.data.granted,
    p_source: parsed.data.source,
    p_policy_version: AI_DATA_CONSENT_POLICY_VERSION,
  });
  if (error) {
    console.error('AI data consent write failed', { code: error.code });
    return NextResponse.json(
      { message: 'Could not save the preference' },
      { status: 500, headers }
    );
  }

  // Withdrawal ends every cached AI temp-auth token for the user at once, so
  // no in-flight token outlives the decision.
  if (!parsed.data.granted && !(await revokeUserAiTempAuthTokens(user.id))) {
    console.warn('AI temp-auth revocation after consent withdrawal failed');
  }

  const row = Array.isArray(data) ? (data[0] as ConsentRow) : null;
  return NextResponse.json(toResponseBody(row), { headers });
}, authOptions);
