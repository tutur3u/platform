import { createFileRoute, redirect } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';
import { normalizeAvatarImageSrc } from '@tuturuuu/utils/avatar-url';
import { ProfileFillContent } from '../../../../components/shared/profile-fill-content';
import {
  buildLoginRedirectHref,
  resolveCurrentUser,
} from '../../../../lib/platform/auth-gate';
import { createPageHead } from '../../../../lib/platform/head';
import type { Locale } from '../../../../lib/platform/locale';
import { resolveMessagesLocale } from '../../../../lib/platform/messages';
import {
  getLinkUnavailableReason,
  isProfileLinkField,
  type ProfileLinkField,
  type ProfileLinkMode,
} from '../../../../lib/platform/profile-links';

type SharedUserProfileRouteParams = {
  code: string;
  locale: string;
};

/**
 * Mirror of the legacy `ProfileLinkPagePayload` (apps/web). Only ever carries
 * the fields the link allows; never any data the visitor is not entitled to.
 */
type ProfileLinkPagePayload = {
  code: string;
  mode: ProfileLinkMode;
  wsId: string;
  allowedFields: ProfileLinkField[];
  prefill: Partial<Record<ProfileLinkField, string | null>>;
  prefillExistingValues: boolean;
  requiresAuth: boolean;
  actorEmail: string | null;
};

/**
 * Server-resolved result mirroring the legacy `ProfileLinkPageResult`.
 * - 200: ok, `data` carries the (allowlist-scoped) payload.
 * - 401: link requires auth and the visitor is not authenticated. `data` is
 *   null — NO link/profile data is exposed (fail closed).
 * - 404: missing / malformed row.
 * - 410: link exists but is revoked / expired / full.
 */
type ProfileLinkPageResult =
  | { status: 200; data: ProfileLinkPagePayload }
  | { status: 401 | 404 | 410; data: null };

type ProfileLinkPageRow = {
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
};

type WorkspaceUserRow = Partial<Record<ProfileLinkField, string | null>>;

function getServerEnvValue(name: string) {
  if (typeof process === 'undefined') {
    return undefined;
  }

  const value = process.env[name]?.trim();
  return value || undefined;
}

function getSupabaseRestUrl(table: string) {
  const rawUrl =
    getServerEnvValue('SUPABASE_SERVER_URL') ??
    getServerEnvValue('SUPABASE_URL') ??
    getServerEnvValue('NEXT_PUBLIC_SUPABASE_URL');

  if (!rawUrl) {
    return null;
  }

  try {
    return new URL(`/rest/v1/${table}`, rawUrl);
  } catch {
    return null;
  }
}

function getSupabaseServiceKey() {
  return (
    getServerEnvValue('SUPABASE_SECRET_KEY') ??
    getServerEnvValue('SUPABASE_SERVICE_ROLE_KEY')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Service-key REST read of a single row from a table/view by exact-match
 * filters. Returns the first matching row (or null). Mirrors the legacy admin
 * `.maybeSingle()` read: the unguessable `code` is the capability, exactly as
 * in the legacy loader's `createAdminClient()` path.
 */
async function fetchSingleRow(
  table: string,
  select: string,
  filters: Record<string, string>
): Promise<Record<string, unknown> | null> {
  const url = getSupabaseRestUrl(table);
  const serviceKey = getSupabaseServiceKey();

  if (!url || !serviceKey) {
    return null;
  }

  url.searchParams.set('select', select);
  for (const [column, value] of Object.entries(filters)) {
    url.searchParams.set(column, `eq.${value}`);
  }
  url.searchParams.set('limit', '1');

  const response = await fetch(url, {
    cache: 'no-store',
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
    },
  });

  if (!response.ok) {
    return null;
  }

  const payload: unknown = await response.json();

  if (!Array.isArray(payload)) {
    return null;
  }

  const [row] = payload;
  return isRecord(row) ? row : null;
}

function toProfileLinkRow(row: Record<string, unknown>): ProfileLinkPageRow {
  const asString = (value: unknown): string | null =>
    typeof value === 'string' ? value : null;
  const asBool = (value: unknown): boolean | null =>
    typeof value === 'boolean' ? value : null;

  return {
    id: asString(row.id),
    ws_id: asString(row.ws_id),
    code: asString(row.code),
    mode: asString(row.mode),
    target_user_id: asString(row.target_user_id),
    allowed_fields: Array.isArray(row.allowed_fields)
      ? (row.allowed_fields.filter(
          (entry): entry is string => typeof entry === 'string'
        ) as string[])
      : null,
    prefill_existing_values: asBool(row.prefill_existing_values),
    requires_auth: asBool(row.requires_auth),
    is_expired: asBool(row.is_expired),
    is_full: asBool(row.is_full),
    is_revoked: asBool(row.is_revoked),
  };
}

/**
 * Faithful port of the legacy `loadProfileLinkForPage` (apps/web). Loads and
 * validates a profile-completion link for its public fill page.
 *
 * Fail-closed auth: when the link `requires_auth`, the visitor MUST be
 * authenticated. If the auth gate cannot resolve a user, this returns
 * `{ status: 401, data: null }` and NO link or profile data is returned.
 * Only fields the link explicitly allows are ever returned.
 */
const loadProfileLink = createServerFn({ method: 'GET' })
  .validator((data: { code: string }) => data)
  .handler(async ({ data }): Promise<ProfileLinkPageResult> => {
    const code = data.code.trim();

    if (!code) {
      return { status: 404, data: null };
    }

    const rawRow = await fetchSingleRow(
      'workspace_user_profile_links_with_stats',
      '*',
      { code }
    );

    if (!rawRow) {
      return { status: 404, data: null };
    }

    const link = toProfileLinkRow(rawRow);

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

    // Auth gate — only when the link requires login. No-auth links can be
    // opened and completed anonymously (the email field becomes a normal
    // field). Fail closed: deny without exposing any data when unauthenticated.
    let actorEmail: string | null = null;
    if (requiresAuth) {
      const user = await resolveCurrentUser();
      if (!user) {
        return { status: 401, data: null };
      }
      actorEmail =
        typeof (user as { email?: unknown }).email === 'string'
          ? ((user as { email?: string }).email ?? null)
          : null;
    }

    const allowedFields = (link.allowed_fields ?? []).filter(
      isProfileLinkField
    ) as ProfileLinkField[];
    const prefillExistingValues = link.prefill_existing_values ?? true;

    const prefill: Partial<Record<ProfileLinkField, string | null>> = {};

    if (
      prefillExistingValues &&
      linkMode === 'per_user' &&
      link.target_user_id
    ) {
      const targetRow = await fetchSingleRow(
        'workspace_users',
        'display_name,full_name,birthday,gender,avatar_url,email,phone',
        { ws_id: linkWsId, id: link.target_user_id }
      );

      if (targetRow) {
        const target = targetRow as WorkspaceUserRow;
        for (const field of allowedFields) {
          const value = target[field] ?? null;
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
  });

type SharedUserProfileLoaderData =
  | { status: 'ok'; payload: ProfileLinkPagePayload }
  | { status: 'unavailable' };

export const Route = createFileRoute('/$locale/shared/user-profile/$code')({
  component: SharedUserProfileRoutePage,
  head: ({ params }) => {
    const { locale: routeLocale } = params as SharedUserProfileRouteParams;
    const locale = resolveMessagesLocale(routeLocale);
    const title =
      locale === 'vi' ? 'Hoàn tất hồ sơ của bạn' : 'Complete your profile';

    return createPageHead({
      locale,
      robots: 'noindex, nofollow',
      title,
    });
  },
  loader: async ({ params }): Promise<SharedUserProfileLoaderData> => {
    const { code = '', locale = '' } =
      params as Partial<SharedUserProfileRouteParams>;

    const result = await loadProfileLink({ data: { code } });

    if (result.status === 401) {
      // Mirror legacy redirect to /login?nextUrl=/shared/user-profile/{code}.
      // No data is exposed before this redirect (fail closed).
      throw redirect({
        href: buildLoginRedirectHref(locale, `/shared/user-profile/${code}`),
        statusCode: 307,
      });
    }

    if (result.status !== 200) {
      // 404 / 410 — render the unavailable shell (do not throw).
      return { status: 'unavailable' };
    }

    return { status: 'ok', payload: result.data };
  },
});

const unavailableMessagesByLocale: Record<
  Locale,
  { title: string; description: string }
> = {
  en: {
    title: 'Link unavailable',
    description:
      'This profile link is invalid, has expired, or has been revoked.',
  },
  vi: {
    title: 'Liên kết không khả dụng',
    description:
      'Liên kết hồ sơ này không hợp lệ, đã hết hạn hoặc đã bị thu hồi.',
  },
};

function UnavailableShell({ locale }: { locale: Locale }) {
  const messages = unavailableMessagesByLocale[locale];

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-background via-dynamic-blue/5 to-dynamic-purple/10 px-4">
      <div className="max-w-lg space-y-3 text-center">
        <h1 className="font-semibold text-3xl">{messages.title}</h1>
        <p className="text-muted-foreground">{messages.description}</p>
      </div>
    </div>
  );
}

function SharedUserProfileRoutePage() {
  const { locale } = Route.useParams() as SharedUserProfileRouteParams;
  const data = Route.useLoaderData() as SharedUserProfileLoaderData;
  const messagesLocale = resolveMessagesLocale(locale);

  if (data.status !== 'ok') {
    return <UnavailableShell locale={messagesLocale} />;
  }

  const { payload } = data;

  return (
    <ProfileFillContent
      code={payload.code}
      mode={payload.mode}
      allowedFields={payload.allowedFields}
      prefill={payload.prefill}
      prefillExistingValues={payload.prefillExistingValues}
      requiresAuth={payload.requiresAuth}
      actorEmail={payload.actorEmail}
      locale={messagesLocale}
    />
  );
}
