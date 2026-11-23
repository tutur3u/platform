import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  jsonNoStore,
  requireUpskiiAppCredentials,
} from '@/lib/integrations/upskii/access';
import {
  auditLinkEvent,
  revokeUpskiiLinkFromProvider,
} from '@/lib/integrations/upskii/link-service';
import { createExternalAccountLinkStore } from '@/lib/integrations/upskii/link-store';

const unlinkSchema = z.object({
  appId: z.string().trim().toLowerCase().max(64),
  appSecret: z.string().min(1).max(200),
  linkId: z.string().trim().max(64),
  upskiiUserId: z.string().trim().min(1).max(128),
});

/** Upskii-initiated disconnect, authenticated with Upskii's app secret. */
export async function POST(request: NextRequest) {
  const parsed = unlinkSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonNoStore({ error: 'Invalid unlink payload' }, { status: 400 });
  }

  const auth = await requireUpskiiAppCredentials(
    parsed.data.appId,
    parsed.data.appSecret
  );
  if (!auth.ok) return auth.response;

  const result = await revokeUpskiiLinkFromProvider(
    createExternalAccountLinkStore(auth.admin),
    { linkId: parsed.data.linkId, upskiiUserId: parsed.data.upskiiUserId }
  );
  if (result === 'not_found') {
    auditLinkEvent('unlink_refused', { reason: 'not_found', side: 'upskii' });
    return jsonNoStore(
      { code: 'LINK_NOT_FOUND', error: 'Link not found' },
      { status: 404 }
    );
  }

  auditLinkEvent('unlinked', { linkId: parsed.data.linkId, side: 'upskii' });
  return jsonNoStore({ revoked: true });
}
