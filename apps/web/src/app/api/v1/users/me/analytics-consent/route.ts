import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withSessionAuth } from '@/lib/api-auth';
import { getDefaultAppSessionVerificationOptions } from '@/lib/api-auth-audiences';

const headers = { 'Cache-Control': 'private, no-store' };

const bodySchema = z
  .object({
    granted: z.boolean(),
    source: z.enum([
      'web_banner',
      'workspace_banner',
      'marketing_banner',
      'web_settings',
    ]),
    policyVersion: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/u),
  })
  .strict();

// Stores the verified user's cookie-banner Analytics choice. The product
// analytics rollup reads it; see apps/docs/platform/data-protection-standard.mdx
// "Product analytics consent". The service-only SQL function binds the write
// to the session user, so a browser or satellite app session works alike.
export const PUT = withSessionAuth(
  async (req, { user }) => {
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
    if (!parsed.success) {
      return NextResponse.json(
        { message: 'Invalid request data' },
        { status: 400, headers }
      );
    }

    const admin = await createAdminClient({ noCookie: true });
    const { data, error } = await admin
      .schema('private')
      .rpc('record_product_analytics_consent', {
        p_user_id: user.id,
        p_granted: parsed.data.granted,
        p_source: parsed.data.source,
        p_policy_version: parsed.data.policyVersion,
      });
    if (error) {
      console.error('Analytics consent write failed', { code: error.code });
      return NextResponse.json(
        { message: 'Could not save the preference' },
        { status: 500, headers }
      );
    }

    const row = Array.isArray(data) ? data[0] : null;
    return NextResponse.json(
      { granted: row?.granted ?? parsed.data.granted },
      { headers }
    );
  },
  {
    allowAppSessionAuth: [
      getDefaultAppSessionVerificationOptions(
        '/api/v1/users/me/analytics-consent'
      ),
    ],
  }
);
