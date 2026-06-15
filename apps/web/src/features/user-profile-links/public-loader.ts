import 'server-only';

import { resolveAuthenticatedSessionUser } from '@tuturuuu/supabase/next/auth-session-user';
import {
  createAdminClient,
  createClient,
} from '@tuturuuu/supabase/next/server';
import { normalizeAvatarImageSrc } from '@tuturuuu/utils/avatar-url';
import {
  getLinkUnavailableReason,
  isProfileLinkField,
  type ProfileLinkField,
  type ProfileLinkMode,
} from './server';

export interface ProfileLinkPagePayload {
  code: string;
  mode: ProfileLinkMode;
  wsId: string;
  allowedFields: ProfileLinkField[];
  /** Current values for the allowed fields (per_user mode only). */
  prefill: Partial<Record<ProfileLinkField, string | null>>;
  /** The logged-in account email — used to lock the email field. */
  actorEmail: string | null;
}

export interface ProfileLinkPageResult {
  /** 200 ok, 401 must-login, 404 missing, 410 unavailable. */
  status: 200 | 401 | 404 | 410;
  data: ProfileLinkPagePayload | null;
}

/**
 * Loads and validates a profile-completion link for its public fill page.
 * Requires the visitor to be authenticated (returns 401 so the page can
 * redirect to login). Only ever returns data for the fields the link allows.
 */
export async function loadProfileLinkForPage(
  code: string
): Promise<ProfileLinkPageResult> {
  const sbAdmin = await createAdminClient();

  const { data: link } = await sbAdmin
    .from('workspace_user_profile_links_with_stats')
    .select(
      'id, ws_id, code, mode, target_user_id, allowed_fields, is_expired, is_full, is_revoked'
    )
    .eq('code', code)
    .maybeSingle();

  if (!link) {
    return { status: 404, data: null };
  }

  if (getLinkUnavailableReason(link)) {
    return { status: 410, data: null };
  }

  // View columns are typed nullable; a malformed row is treated as missing.
  const linkWsId = link.ws_id;
  const linkCode = link.code;
  const linkMode = link.mode;
  if (!linkWsId || !linkCode || !linkMode) {
    return { status: 404, data: null };
  }

  // Auth gate — visitor must be logged in before seeing or filling anything.
  const supabase = await createClient();
  const { user } = await resolveAuthenticatedSessionUser(supabase);
  if (!user) {
    return { status: 401, data: null };
  }

  const allowedFields = (link.allowed_fields ?? []).filter(
    isProfileLinkField
  ) as ProfileLinkField[];

  const prefill: Partial<Record<ProfileLinkField, string | null>> = {};

  if (linkMode === 'per_user' && link.target_user_id) {
    const { data: target } = await sbAdmin
      .from('workspace_users')
      .select('display_name, full_name, birthday, gender, avatar_url, email')
      .eq('ws_id', linkWsId)
      .eq('id', link.target_user_id)
      .maybeSingle();

    if (target) {
      for (const field of allowedFields) {
        const value = (target as Record<string, string | null>)[field] ?? null;
        prefill[field] =
          field === 'avatar_url'
            ? (normalizeAvatarImageSrc(value) ?? null)
            : value;
      }
    }
  }

  return {
    status: 200,
    data: {
      code: linkCode,
      mode: linkMode as ProfileLinkMode,
      wsId: linkWsId,
      allowedFields,
      prefill,
      actorEmail: user.email ?? null,
    },
  };
}
