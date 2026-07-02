import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { toWorkspaceSlug } from '@tuturuuu/utils/constants';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';
import { TUTURUUU_PORTLESS_ROOT_HOST } from '@tuturuuu/utils/portless';

export type LegacySearchParams = Record<
  string,
  boolean | number | string | (boolean | number | string)[] | null | undefined
>;

const localRuntimeOriginKeys = [
  'BASE_URL',
  'PORTLESS_URL',
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_WEB_APP_URL',
  'WEB_APP_URL',
] as const;

export function pricingRedirectHref(options: { localized?: boolean } = {}) {
  if (options.localized) {
    return '/pricing';
  }

  return '/?hash-nav=1#pricing';
}

export function docsRedirectHref() {
  return 'https://docs.tuturuuu.com';
}

export function meetTogetherProductRedirectHref() {
  return '/meet-together';
}

export function workspaceUserDatabaseRedirectHref(wsId: string) {
  return `/${wsId}/users/database`;
}

export function workspaceChatRedirectHref(wsId: string) {
  return `/${wsId}/chat`;
}

export function workspaceDashboardRedirectHref(wsId: string) {
  return `/${wsId}`;
}

export function workspaceHabitsRedirectHref(wsId: string) {
  return `/${wsId}/habits`;
}

export function workspaceMeetPlansRedirectHref(wsId: string) {
  return `/${wsId}/meet/plans`;
}

export function workspaceRolesRedirectHref(wsId: string) {
  return `/${wsId}/members?tab=roles`;
}

export function workspaceTopicAnnouncementsRedirectHref(wsId: string) {
  return `/${wsId}/users/topic-announcements/announcements`;
}

export function workspaceInfrastructureAppCoordinationRedirectHref(
  wsId: string
) {
  return new URL(
    `/${wsId}/app-coordination`,
    `${getInfraAppOrigin()}/`
  ).toString();
}

export function buildFinanceRedirectHref(
  workspaceId: string,
  financePath: string,
  options: {
    personal?: boolean;
    searchParams?: LegacySearchParams | string | URLSearchParams;
  } = {}
) {
  const workspaceSlug = toWorkspaceSlug(workspaceId, {
    personal: options.personal,
  });
  const normalizedFinancePath = financePath.replace(/^\/+|\/+$/g, '');
  const financeSuffix = normalizedFinancePath
    ? `/${normalizedFinancePath}`
    : '';
  const url = new URL(
    `/${workspaceSlug}/finance${financeSuffix}`,
    'https://finance.local'
  );

  appendSearchParams(url, options.searchParams);

  return `${url.pathname}${url.search}`;
}

export function buildFinanceTransactionCategoriesRedirectHref(
  workspaceId: string,
  options: {
    personal?: boolean;
    searchParams?: LegacySearchParams | string | URLSearchParams;
  } = {}
) {
  return buildFinanceRedirectHref(workspaceId, 'categories', options);
}

export function educationLibraryRedirectHref(
  wsId: string,
  resource: 'flashcards' | 'quiz-sets' | 'quizzes'
) {
  return `/${wsId}/education/library/${resource}`;
}

export function courseBuilderRedirectHref(wsId: string, courseId: string) {
  return `/${wsId}/education/courses/${courseId}/builder`;
}

export function meetTogetherCalendarRedirectHref(splat?: string) {
  const normalizedSplat = splat?.replace(/^\/+|\/+$/g, '');

  return normalizedSplat
    ? `/meet-together/${normalizedSplat}`
    : '/meet-together';
}

function isLocalPortlessUrl(value: string | undefined) {
  if (!value?.trim()) {
    return false;
  }

  try {
    const hostname = new URL(value).hostname;

    return (
      hostname === TUTURUUU_PORTLESS_ROOT_HOST ||
      hostname.endsWith(`.${TUTURUUU_PORTLESS_ROOT_HOST}`)
    );
  } catch {
    return false;
  }
}

function isLocalPortlessRuntime() {
  return localRuntimeOriginKeys.some((key) =>
    isLocalPortlessUrl(process.env[key])
  );
}

function getQrAppFallbackOrigin() {
  const localOrigin = getLocalInternalAppUrl('qr', 'http://localhost:7819');

  return isLocalPortlessRuntime() || process.env.NODE_ENV !== 'production'
    ? localOrigin
    : 'https://qr.tuturuuu.com';
}

export function getQrAppOrigin() {
  return resolveInternalAppUrl({
    appName: 'qr',
    candidates: [process.env.QR_APP_URL, process.env.NEXT_PUBLIC_QR_APP_URL],
    fallback: getQrAppFallbackOrigin(),
  });
}

export function getMailAppOrigin() {
  return resolveInternalAppUrl({
    appName: 'mail',
    candidates: [
      process.env.MAIL_APP_URL,
      process.env.NEXT_PUBLIC_MAIL_APP_URL,
    ],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://mail.tuturuuu.com'
        : getLocalInternalAppUrl('mail', 'http://localhost:7820'),
  });
}

export function getMeetAppOrigin() {
  return resolveInternalAppUrl({
    appName: 'meet',
    candidates: [
      process.env.MEET_APP_URL,
      process.env.NEXT_PUBLIC_MEET_APP_URL,
    ],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://meet.tuturuuu.com'
        : getLocalInternalAppUrl('meet', 'http://localhost:7807'),
  });
}

export function getDriveAppOrigin() {
  return resolveInternalAppUrl({
    appName: 'drive',
    candidates: [
      process.env.DRIVE_APP_URL,
      process.env.NEXT_PUBLIC_DRIVE_APP_URL,
    ],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://drive.tuturuuu.com'
        : getLocalInternalAppUrl('drive', 'http://localhost:7817'),
  });
}

export function getHiveAppOrigin() {
  return resolveInternalAppUrl({
    appName: 'hive',
    candidates: [
      process.env.HIVE_APP_URL,
      process.env.NEXT_PUBLIC_HIVE_APP_URL,
    ],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://hive.tuturuuu.com'
        : getLocalInternalAppUrl('hive', 'http://localhost:7814'),
  });
}

export function getMindAppOrigin() {
  return resolveInternalAppUrl({
    appName: 'mind',
    candidates: [
      process.env.MIND_APP_URL,
      process.env.NEXT_PUBLIC_MIND_APP_URL,
    ],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://mind.tuturuuu.com'
        : getLocalInternalAppUrl('mind', 'http://localhost:7816'),
  });
}

export function getCmsAppOrigin() {
  return resolveInternalAppUrl({
    appName: 'cms',
    candidates: [process.env.CMS_APP_URL, process.env.NEXT_PUBLIC_CMS_APP_URL],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://cms.tuturuuu.com'
        : getLocalInternalAppUrl('cms', 'http://localhost:7811'),
  });
}

export function getInfraAppOrigin() {
  return resolveInternalAppUrl({
    appName: 'infra',
    candidates: [
      process.env.INFRA_APP_URL,
      process.env.NEXT_PUBLIC_INFRA_APP_URL,
    ],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://infra.tuturuuu.com'
        : getLocalInternalAppUrl('infra', 'http://localhost:7823'),
  });
}

function normalizeSearchParams(search: string | URLSearchParams) {
  if (typeof search !== 'string') return search;

  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
}

function appendSearchParams(
  url: URL,
  searchParams?: LegacySearchParams | string | URLSearchParams,
  options: { preserveEmptyStringValues?: boolean } = {}
) {
  if (!searchParams) return;

  if (
    typeof searchParams === 'string' ||
    searchParams instanceof URLSearchParams
  ) {
    for (const [key, value] of normalizeSearchParams(searchParams)) {
      url.searchParams.append(key, value);
    }

    return;
  }

  for (const [key, value] of Object.entries(searchParams)) {
    if (value === null || value === undefined) continue;
    if (value === '' && !options.preserveEmptyStringValues) continue;

    const values = Array.isArray(value) ? value : [value];

    for (const entry of values) {
      url.searchParams.append(key, String(entry));
    }
  }
}

export function buildQrGeneratorRedirectHref(
  search: LegacySearchParams | string | URLSearchParams
) {
  const url = new URL(getQrAppOrigin());

  appendSearchParams(url, search, { preserveEmptyStringValues: true });

  return url.toString();
}

export function buildMailRedirectHref(
  wsId: string,
  options: { folder?: string } = {}
) {
  const url = new URL(`/${wsId}`, `${getMailAppOrigin()}/`);

  if (options.folder) {
    url.searchParams.set('folder', options.folder);
  }

  return url.toString();
}

export function buildMeetPlansRedirectHref(
  workspaceId: string,
  options: {
    searchParams?: LegacySearchParams | string | URLSearchParams;
  } = {}
) {
  const workspaceSlug = toWorkspaceSlug(workspaceId);
  const url = new URL(
    `/workspace/${encodeURIComponent(workspaceSlug)}/plans`,
    `${getMeetAppOrigin()}/`
  );

  appendSearchParams(url, options.searchParams);

  return url.toString();
}

export function buildMeetMeetingsRedirectHref(
  workspaceId: string,
  options: {
    searchParams?: LegacySearchParams | string | URLSearchParams;
  } = {}
) {
  const workspaceSlug = toWorkspaceSlug(workspaceId);
  const url = new URL(
    `/workspace/${encodeURIComponent(workspaceSlug)}/meetings`,
    `${getMeetAppOrigin()}/`
  );

  appendSearchParams(url, options.searchParams);

  return url.toString();
}

export function buildMeetMeetingRedirectHref(
  workspaceId: string,
  meetingId: string,
  options: {
    searchParams?: LegacySearchParams | string | URLSearchParams;
  } = {}
) {
  const workspaceSlug = toWorkspaceSlug(workspaceId);
  const url = new URL(
    `/workspace/${encodeURIComponent(workspaceSlug)}/meetings/${encodeURIComponent(meetingId)}`,
    `${getMeetAppOrigin()}/`
  );

  appendSearchParams(url, options.searchParams);

  return url.toString();
}

export function buildDriveRedirectHref(
  workspaceId: string,
  options: {
    personal?: boolean;
    searchParams?: LegacySearchParams | string | URLSearchParams;
  } = {}
) {
  const workspaceSlug = toWorkspaceSlug(workspaceId, {
    personal: options.personal,
  });
  const url = new URL(
    `/${encodeURIComponent(workspaceSlug)}`,
    `${getDriveAppOrigin()}/`
  );

  appendSearchParams(url, options.searchParams);

  return url.toString();
}

export function buildHiveDashboardRedirectHref(
  options: { searchParams?: LegacySearchParams | string | URLSearchParams } = {}
) {
  const url = new URL('/dashboard', `${getHiveAppOrigin()}/`);

  appendSearchParams(url, options.searchParams);

  return url.toString();
}

export function buildHiveNotWhitelistedRedirectHref(
  options: { searchParams?: LegacySearchParams | string | URLSearchParams } = {}
) {
  const url = new URL('/not-whitelisted', `${getHiveAppOrigin()}/`);

  appendSearchParams(url, options.searchParams);

  return url.toString();
}

export function buildMindRedirectHref(
  workspaceId: string,
  options: {
    searchParams?: LegacySearchParams | string | URLSearchParams;
  } = {}
) {
  const workspaceSlug = toWorkspaceSlug(workspaceId);
  const url = new URL(
    `/${encodeURIComponent(workspaceSlug)}`,
    `${getMindAppOrigin()}/`
  );

  appendSearchParams(url, options.searchParams);

  return url.toString();
}

export function buildMindBoardRedirectHref(
  workspaceId: string,
  boardId: string,
  options: {
    searchParams?: LegacySearchParams | string | URLSearchParams;
  } = {}
) {
  const workspaceSlug = toWorkspaceSlug(workspaceId);
  const url = new URL(
    `/${encodeURIComponent(workspaceSlug)}/boards/${encodeURIComponent(boardId)}`,
    `${getMindAppOrigin()}/`
  );

  appendSearchParams(url, options.searchParams);

  return url.toString();
}

export function buildCmsRedirectHref(pathname: string) {
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return new URL(normalizedPath, `${getCmsAppOrigin()}/`).toString();
}

export function buildCmsCollectionRedirectHref(
  wsId: string,
  collectionId: string
) {
  return buildCmsRedirectHref(`/${wsId}/content/collections/${collectionId}`);
}

export function buildCmsEntryRedirectHref(wsId: string, entryId: string) {
  return buildCmsRedirectHref(`/${wsId}/content/entries/${entryId}`);
}

export function buildVerifyTokenRedirectHref(search: string | URLSearchParams) {
  const searchParams = normalizeSearchParams(search);

  return normalizeClientRedirectPath(
    searchParams.get('nextUrl'),
    '/onboarding'
  );
}

function normalizeClientRedirectPath(
  nextUrl: string | null | undefined,
  fallbackPath: string
) {
  if (
    !nextUrl?.startsWith('/') ||
    nextUrl.startsWith('//') ||
    nextUrl.includes('\\') ||
    hasAsciiControlCharacter(nextUrl)
  ) {
    return fallbackPath;
  }

  return nextUrl;
}

function hasAsciiControlCharacter(value: string) {
  for (let index = 0; index < value.length; index += 1) {
    const charCode = value.charCodeAt(index);

    if (charCode <= 0x1f || charCode === 0x7f) {
      return true;
    }
  }

  return false;
}
