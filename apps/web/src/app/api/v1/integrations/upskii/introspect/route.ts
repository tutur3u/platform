import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  jsonNoStore,
  requireUpskiiAppCredentials,
} from '@/lib/integrations/upskii/access';
import { introspectUpskiiReadToken } from '@/lib/integrations/upskii/link-service';
import { createExternalAccountLinkStore } from '@/lib/integrations/upskii/link-store';

const introspectSchema = z.object({
  appId: z.string().trim().toLowerCase().max(64),
  appSecret: z.string().min(1).max(200),
  token: z.string().min(1).max(4096),
});

/**
 * Upskii checks a read token Tuturuuu sent it. Only Upskii's own credentials
 * may ask, and the answer names the link so Upskii can match its own row.
 */
export async function POST(request: NextRequest) {
  const parsed = introspectSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return jsonNoStore(
      { error: 'Invalid introspection payload' },
      { status: 400 }
    );
  }

  const auth = await requireUpskiiAppCredentials(
    parsed.data.appId,
    parsed.data.appSecret
  );
  if (!auth.ok) return auth.response;

  return jsonNoStore(
    await introspectUpskiiReadToken(
      createExternalAccountLinkStore(auth.admin),
      parsed.data.token
    )
  );
}
