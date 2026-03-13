export const GITHUB_OWNER = 'tutur3u';
export const GITHUB_REPO = 'platform';
export const ROOT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';
export const INTERNAL_WORKSPACE_SLUG = 'internal';
export const PERSONAL_WORKSPACE_SLUG = 'personal';

// Workspace creation limits
export const MAX_WORKSPACES_FOR_FREE_USERS = 10;

export const resolveWorkspaceId = (identifier: string): string => {
  if (!identifier) return identifier;

  if (identifier.toLowerCase() === INTERNAL_WORKSPACE_SLUG) {
    return ROOT_WORKSPACE_ID;
  }

  return identifier;
};

export const normalizeWorkspaceContextId = (identifier?: string | null) => {
  const trimmed = identifier?.trim();
  if (!trimmed) return PERSONAL_WORKSPACE_SLUG;

  if (trimmed.toLowerCase() === PERSONAL_WORKSPACE_SLUG) {
    return PERSONAL_WORKSPACE_SLUG;
  }

  return resolveWorkspaceId(trimmed);
};

export const toWorkspaceSlug = (
  workspaceId: string,
  { personal = false }: { personal?: boolean } = {}
): string => {
  if (personal) return PERSONAL_WORKSPACE_SLUG;
  if (workspaceId === ROOT_WORKSPACE_ID) return INTERNAL_WORKSPACE_SLUG;
  return workspaceId;
};

export const isInternalWorkspaceSlug = (
  identifier?: string | null
): boolean => {
  if (!identifier) return false;
  return identifier.toLowerCase() === INTERNAL_WORKSPACE_SLUG;
};

export const DEV_MODE = process.env.NODE_ENV === 'development';
export const PROD_MODE = process.env.NODE_ENV === 'production';

// ── Generic text field length tiers ──────────────────────────────────────────
// Use these when a domain-specific constant below does not exist.
export const MAX_CODE_LENGTH = 10; // locale codes, currency codes
export const MAX_OTP_LENGTH = 20; // OTP / verification codes
export const MAX_IP_LENGTH = 45; // IPv6 addresses
export const MAX_COLOR_LENGTH = 50; // CSS color values, hex strings
export const MAX_DATE_STRING_LENGTH = 50; // ISO date strings
export const MAX_SHORT_TEXT_LENGTH = 100; // status, type, timezone, provider
export const MAX_ID_LENGTH = 255; // non-UUID identifiers, slugs
export const MAX_NAME_LENGTH = 255; // generic names, titles, labels
export const MAX_SEARCH_LENGTH = 500; // search queries, reasons, subjects
export const MAX_MEDIUM_TEXT_LENGTH = 1000; // notes, paths, config values
export const MAX_URL_LENGTH = 2000; // URLs, tokens, long identifiers
export const MAX_LONG_TEXT_LENGTH = 10000; // descriptions, content, messages
export const MAX_RICH_TEXT_LENGTH = 50000; // HTML content, rich text

// ── Domain-specific field limits ─────────────────────────────────────────────
export const MAX_DISPLAY_NAME_LENGTH = 100;
export const MAX_FULL_NAME_LENGTH = 100;
export const MAX_BIO_LENGTH = 1000;
export const MAX_EMAIL_LENGTH = 320; // Based on RFC 5321 (64 for local-part + 1 for @ + 255 for domain)

// Payload limits
export const MAX_PAYLOAD_SIZE = 200 * 1024; // 200KB
export const MAX_REQUEST_BODY_BYTES = 256 * 1024; // 256KB — global limit for non-file-upload API routes
export const MAX_TEXT_FIELD_BYTES = 40_000; // 40KB — covers 10K emoji chars (4 bytes each)
export const MAX_WORKSPACE_NAME_LENGTH = 100;
export const MAX_TASK_NAME_LENGTH = 255;
export const MAX_TASK_DESCRIPTION_LENGTH = 20000;
export const MAX_CHAT_MESSAGE_LENGTH = 10000;
export const MAX_SUPPORT_INQUIRY_LENGTH = 5000;
export const MAX_CALENDAR_EVENT_TITLE_LENGTH = 255;
export const MAX_CALENDAR_EVENT_DESCRIPTION_LENGTH = 10000;
export const MAX_NOTE_TITLE_LENGTH = 255;
export const MAX_NOTE_CONTENT_LENGTH = 50000;
