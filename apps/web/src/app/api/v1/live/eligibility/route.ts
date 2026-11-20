import { normalizeWorkspaceId } from '@tuturuuu/utils/workspace-helper';
import { connection, type NextRequest } from 'next/server';
import { z } from 'zod';
import { resolveBillingWorkspace } from '@/lib/live/web-billing';
import { liveEligibilityResponse } from './shared';

const querySchema = z.object({
  wsId: z.string().trim().min(1).max(128),
  creditSource: z.enum(['personal', 'workspace']),
  creditWsId: z.string().trim().min(1).max(128).optional(),
});

/** Web Live bills the dashboard's selected credit source. */
export async function GET(request: NextRequest) {
  await connection();
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    wsId: url.searchParams.get('wsId') ?? undefined,
    creditSource: url.searchParams.get('creditSource') ?? undefined,
    creditWsId: url.searchParams.get('creditWsId') ?? undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: 'Invalid request' }, { status: 400 });
  }
  const { wsId, creditSource, creditWsId } = parsed.data;
  return liveEligibilityResponse({
    request,
    wsId,
    resolveBillingWsId: async ({ accessWsId, supabase, userId }) =>
      resolveBillingWorkspace({
        accessWsId,
        creditSource,
        creditWsId: creditWsId
          ? await normalizeWorkspaceId(creditWsId, supabase, request)
          : undefined,
        userId,
      }),
  });
}
