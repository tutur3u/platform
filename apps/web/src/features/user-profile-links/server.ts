import crypto from 'node:crypto';

/**
 * Profile fields an external user may complete through a profile-completion
 * link. This is the single source of truth shared by the DB CHECK constraint,
 * the link-creation API, and the public submit endpoint.
 */
export const PROFILE_LINK_FIELDS = [
  'display_name',
  'full_name',
  'birthday',
  'gender',
  'avatar_url',
  'email',
  'phone',
] as const;

export type ProfileLinkField = (typeof PROFILE_LINK_FIELDS)[number];

export type ProfileLinkMode = 'per_user' | 'generic';

export function isProfileLinkField(value: string): value is ProfileLinkField {
  return (PROFILE_LINK_FIELDS as readonly string[]).includes(value);
}

/**
 * Generates a URL-safe, unambiguous share code (mirrors the forms share-code
 * generator: omits look-alike characters such as 0/O and 1/l/I).
 */
export function generateProfileLinkCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let code = '';

  for (let index = 0; index < 12; index += 1) {
    code += chars.charAt(crypto.randomInt(0, chars.length));
  }

  return code;
}

export interface SanitizedPayloadResult {
  payload: Record<string, string | null>;
  submittedFields: ProfileLinkField[];
}

/** Loose email shape guard for submitter-entered emails on no-auth links. */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Builds the workspace_users update payload from a raw submission body, keeping
 * only fields the link explicitly allows.
 *
 * The `email` field is special:
 * - On links that require login (`lockEmail: true`), it is forced to the
 *   authenticated account email — an external user can never set it to anything
 *   else.
 * - On no-auth links (`lockEmail: false`), there is no account email, so the
 *   submitter-entered value is accepted (after a light format guard).
 */
export function buildSanitizedPayload(
  allowedFields: readonly string[],
  body: Record<string, unknown>,
  {
    actorEmail,
    lockEmail = true,
  }: { actorEmail: string | null | undefined; lockEmail?: boolean }
): SanitizedPayloadResult {
  const allowed = new Set(allowedFields.filter(isProfileLinkField));
  const payload: Record<string, string | null> = {};
  const submittedFields: ProfileLinkField[] = [];

  for (const field of PROFILE_LINK_FIELDS) {
    if (!allowed.has(field)) continue;
    if (!(field in body)) continue;

    if (field === 'email') {
      if (lockEmail) {
        // Locked to the authenticated account email regardless of input.
        if (!actorEmail) continue;
        payload.email = actorEmail;
        submittedFields.push('email');
        continue;
      }

      // No-auth link: accept the submitter's email when it looks valid.
      const rawEmail = body.email;
      const email =
        rawEmail === null || rawEmail === ''
          ? null
          : String(rawEmail).trim() || null;
      if (email !== null && !EMAIL_PATTERN.test(email)) continue;
      payload.email = email;
      submittedFields.push('email');
      continue;
    }

    const raw = body[field];
    if (raw === undefined) continue;

    const value =
      raw === null || raw === '' ? null : String(raw).trim() || null;
    payload[field] = value;
    submittedFields.push(field);
  }

  return { payload, submittedFields };
}

/**
 * Returns the keys a client submitted that are NOT permitted by the link's
 * allowlist (ignoring the always-server-controlled bookkeeping keys). A
 * non-empty result should be rejected with a 400.
 */
export function findDisallowedFields(
  submittedKeys: string[],
  allowedFields: readonly string[]
): string[] {
  const allowed = new Set(allowedFields);
  return submittedKeys.filter(
    (key) => isProfileLinkField(key) === false || !allowed.has(key)
  );
}

/** Whether a link (row from the stats view) can currently accept submissions. */
export function getLinkUnavailableReason(link: {
  is_expired?: boolean | null;
  is_full?: boolean | null;
  is_revoked?: boolean | null;
}): 'revoked' | 'expired' | 'full' | null {
  if (link.is_revoked) return 'revoked';
  if (link.is_expired) return 'expired';
  if (link.is_full) return 'full';
  return null;
}
