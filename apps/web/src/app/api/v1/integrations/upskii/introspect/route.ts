import type { NextRequest } from 'next/server';
import { z } from 'zod';
import {
  jsonNoStore,
  requireUpskiiAppCredentials,
} from '@/lib/integrations/upskii/access';
import { introspectUpskiiReadToken } from '@/lib/integrations/upskii/link-service';
import { createExternalAccountLinkStore } from '@/lib/integrations/upskii/link-store';

const introspectSchema = z.object({
  token: z.string().min(1).max(4096),
});

/**
 * Upskii checks a read token Tuturuuu sent it. Only Upskii's own credentials
 * (`Authorization: Basic base64(upskii:<app secret>)`) may ask, and the
 * answer names the link so Upskii can match its own row.
 */
export async function POST(request: NextRequest) {
  const auth = await requireUpskiiAppCredentials(request, 'introspect');
  if (!auth.ok) return auth.response;

  const parsed = introspectSchema.safeParse(
    await request.json().catch(() => null)
  );
  if (!parsed.success) {
    return jsonNoStore(
      { error: 'Invalid introspection payload' },
      { status: 400 }
    );
  }

  return jsonNoStore(
    await introspectUpskiiReadToken(
      createExternalAccountLinkStore(auth.admin),
      parsed.data.token
    )
  );
}
