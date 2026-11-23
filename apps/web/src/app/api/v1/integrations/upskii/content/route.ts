import { createAdminClient } from '@tuturuuu/supabase/next/server';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import { CURRENT_USER_APP_SESSION_AUTH } from '@/legacy-api-routes/v1/users/me/session-auth';
import { withSessionAuth } from '@/lib/api-auth';
import { jsonNoStore } from '@/lib/integrations/upskii/access';
import {
  fetchUpskiiContent,
  UPSKII_CONTENT_KINDS,
  UPSKII_CONTENT_SCOPES,
  type UpskiiContentKind,
  upskiiClassIdSchema,
} from '@/lib/integrations/upskii/content';
import { createExternalAccountLinkStore } from '@/lib/integrations/upskii/link-store';
import { mintUpskiiReadTokenForUser } from '@/lib/integrations/upskii/read-token';

function isKind(value: string | null): value is UpskiiContentKind {
  return (UPSKII_CONTENT_KINDS as readonly (string | null)[]).includes(value);
}

/**
 * The signed-in user's Upskii classes, or one class's lessons or
 * assessments, for Meet. The link comes from the session alone; the read
 * token is minted and spent here and never reaches the client.
 */
export const GET = withSessionAuth(
  async (request, { user }) => {
    const params = request.nextUrl.searchParams;
    const kind = params.get('kind');
    if (!isKind(kind)) {
      return jsonNoStore({ code: 'INVALID_KIND' }, { status: 400 });
    }
    const rawClassId = params.get('classId');
    let classId: string | null = null;
    if (kind !== 'classes') {
      const parsed = upskiiClassIdSchema.safeParse(rawClassId);
      if (!parsed.success) {
        return jsonNoStore({ code: 'CLASS_ID_REQUIRED' }, { status: 400 });
      }
      classId = parsed.data;
    }

    const admin = (await createAdminClient()) as TypedSupabaseClient;
    const minted = await mintUpskiiReadTokenForUser({
      admin,
      scope: UPSKII_CONTENT_SCOPES[kind],
      store: createExternalAccountLinkStore(admin),
      userId: user.id,
    });
    if (!minted.ok) {
      return jsonNoStore(
        { code: minted.code },
        { status: minted.code === 'NOT_LINKED' ? 404 : 403 }
      );
    }

    const result = await fetchUpskiiContent({
      classId,
      kind,
      token: minted.token,
    });
    if (!result.ok) {
      return jsonNoStore({ code: result.code }, { status: result.status });
    }
    return jsonNoStore({ items: result.items });
  },
  {
    allowAppSessionAuth: CURRENT_USER_APP_SESSION_AUTH,
    rateLimit: { windowMs: 60000, maxRequests: 60 },
  }
);
