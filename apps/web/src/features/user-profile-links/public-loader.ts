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
  /** Whether the link allowed existing values to be returned to the visitor. */
  prefillExistingValues: boolean;
  /** When false, the link can be completed without an account. */
  requiresAuth: boolean;
  /** The logged-in account email — used to lock the email field (auth links). */
  actorEmail: string | null;
}

export interface ProfileLinkPageResult {
  /** 200 ok, 401 must-login, 404 missing, 410 unavailable. */
  status: 200 | 401 | 404 | 410;
  data: ProfileLinkPagePayload | null;
}

interface ProfileLinkPageRow {
  id: string | null;
  ws_id: string | null;
  code: string | null;
  mode: string | null;
  target_user_id: string | null;
  allowed_fields: string[] | null;
  prefill_existing_values?: boolean | null;
  requires_auth?: boolean | null;
  is_expired: boolean | null;
  is_full: boolean | null;
  is_revoked: boolean | null;
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

  const { data: rawLink } = await sbAdmin
    .from('workspace_user_profile_links_with_stats')
    .select('*')
    .eq('code', code)
    .maybeSingle();
  const link = rawLink as ProfileLinkPageRow | null;

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

  const requiresAuth = link.requires_auth ?? true;

  // Auth gate — only when the link requires login. No-auth links can be opened
  // and completed anonymously (the email field becomes a normal field).
  let actorEmail: string | null = null;
  if (requiresAuth) {
    const supabase = await createClient();
    const { user } = await resolveAuthenticatedSessionUser(supabase);
    if (!user) {
      return { status: 401, data: null };
    }
    actorEmail = user.email ?? null;
  }

  const allowedFields = (link.allowed_fields ?? []).filter(
    isProfileLinkField
  ) as ProfileLinkField[];
  const prefillExistingValues = link.prefill_existing_values ?? true;

  const prefill: Partial<Record<ProfileLinkField, string | null>> = {};

  if (prefillExistingValues && linkMode === 'per_user' && link.target_user_id) {
    const { data: target } = await sbAdmin
      .from('workspace_users')
      .select(
        'display_name, full_name, birthday, gender, avatar_url, email, phone'
      )
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
      prefillExistingValues,
      requiresAuth,
      actorEmail,
    },
  };
}
