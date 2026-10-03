import { createHash } from 'node:crypto';
import { ProfileUploadError } from '@tuturuuu/storage-core/profile-upload-budget';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getLinkUnavailableReason } from '@/features/user-profile-links/server';
import { createOptimizedProfileMediaTicket } from '@/lib/profile-media-ticket';

interface Params {
  params: Promise<{ code: string }>;
}

const bodySchema = z.object({
  contentType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
});

export async function POST(req: Request, { params }: Params) {
  const { code } = await params;

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { message: 'contentType is required' },
      { status: 400 }
    );
  }

  const sbAdmin = await createAdminClient();
  const { data: link } = await sbAdmin
    .from('workspace_user_profile_links_with_stats')
    .select(
      'ws_id, allowed_fields, requires_auth, is_expired, is_full, is_revoked'
    )
    .eq('code', code)
    .maybeSingle();

  if (!link) {
    return NextResponse.json({ message: 'Link not found' }, { status: 404 });
  }

  // Require login only when the link requires it (no-auth links allow anonymous
  // uploads; the signed path is link-code-scoped, not user-scoped).
  if (link.requires_auth ?? true) {
    const supabase = await createClient(req);
    const { user } = await resolveAuthenticatedSessionUser(supabase);
    if (!user?.id) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
  }

  if (getLinkUnavailableReason(link)) {
    return NextResponse.json(
      { message: 'Link is no longer available' },
      { status: 410 }
    );
  }
  if (!(link.allowed_fields ?? []).includes('avatar_url')) {
    return NextResponse.json(
      { message: 'Avatar uploads are not permitted for this link' },
      { status: 403 }
    );
  }

  // A verified active link is the anonymous capability; charge its stable
  // identity rather than a caller-supplied workspace or a fresh random ID.
  const digest = createHash('sha256')
    .update(`profile-link:${link.ws_id}:${code}`)
    .digest('hex');
  const actorId = `${digest.slice(0, 8)}-${digest.slice(8, 12)}-${digest.slice(12, 16)}-${digest.slice(16, 20)}-${digest.slice(20, 32)}`;
  try {
    if (!/^[a-zA-Z0-9_-]{1,100}$/.test(code))
      return NextResponse.json({ message: 'Invalid link' }, { status: 400 });
    const ticket = await createOptimizedProfileMediaTicket(
      actorId,
      'avatar',
      process.env.NEXT_PUBLIC_APP_URL || req.url,
      undefined,
      `${link.ws_id}/users/profile-link/${code}`
    );
    return NextResponse.json(
      { ...ticket, path: ticket.filePath },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    return NextResponse.json(
      { message: 'Avatar upload unavailable' },
      {
        status: error instanceof ProfileUploadError ? error.status : 503,
        headers:
          error instanceof ProfileUploadError && error.retryAfter
            ? { 'Retry-After': String(error.retryAfter) }
            : undefined,
      }
    );
  }
}
