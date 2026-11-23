import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  jsonNoStore,
  requireUpskiiAppCredentials,
} from '@/lib/integrations/upskii/access';
import { getUpskiiLinkStatusForProvider } from '@/lib/integrations/upskii/link-service';
import { createExternalAccountLinkStore } from '@/lib/integrations/upskii/link-store';

const statusSchema = z.object({
  linkId: z.string().trim().max(64),
  upskiiUserId: z.string().trim().min(1).max(128),
});

/**
 * Upskii confirms that its own link row is still active on Tuturuuu, so a
 * link disconnected here stops showing as linked there. Authenticated with
 * `Authorization: Basic base64(upskii:<app secret>)`.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUpskiiAppCredentials(request, 'link-status');
  if (!auth.ok) return auth.response;

  const parsed = statusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonNoStore({ error: 'Invalid status payload' }, { status: 400 });
  }

  return jsonNoStore(
    await getUpskiiLinkStatusForProvider(
      createExternalAccountLinkStore(auth.admin),
      parsed.data
    )
  );
}
