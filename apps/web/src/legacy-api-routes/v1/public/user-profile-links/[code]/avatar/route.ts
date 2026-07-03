import crypto from 'node:crypto';
import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getLinkUnavailableReason } from '@/features/user-profile-links/server';
import { serverLogger } from '@/lib/infrastructure/log-drain';

interface Params {
  params: Promise<{ code: string }>;
}

const bodySchema = z.object({
  contentType: z.string().min(1).max(100),
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

  // Scope the upload path under the workspace user-avatar tree, namespaced by
  // the link code so an external user cannot write elsewhere.
  const filePath = `${link.ws_id}/users/profile-link/${code}/${crypto.randomUUID()}.jpg`;

  const { data, error } = await sbAdmin.storage
    .from('avatars')
    .createSignedUploadUrl(filePath);

  if (error) {
    serverLogger.error('Error creating profile-link avatar upload URL:', error);
    return NextResponse.json(
      { message: 'Error creating signed upload URL' },
      { status: 500 }
    );
  }

  const { data: publicUrlData } = sbAdmin.storage
    .from('avatars')
    .getPublicUrl(filePath);

  return NextResponse.json({
    ...data,
    path: filePath,
    publicUrl: publicUrlData.publicUrl,
  });
}
