import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export function pricingRedirectHref() {
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
  return `/${wsId}/infrastructure/app-coordination`;
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

export function getQrAppOrigin() {
  return resolveInternalAppUrl({
    appName: 'qr',
    candidates: [process.env.QR_APP_URL, process.env.NEXT_PUBLIC_QR_APP_URL],
    fallback:
      process.env.NODE_ENV === 'production'
        ? 'https://qr.tuturuuu.com'
        : getLocalInternalAppUrl('qr', 'http://localhost:7819'),
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

function normalizeSearchParams(search: string | URLSearchParams) {
  if (typeof search !== 'string') return search;

  return new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
}

export function buildQrGeneratorRedirectHref(search: string | URLSearchParams) {
  const url = new URL(getQrAppOrigin());
  const searchParams = normalizeSearchParams(search);

  for (const [key, value] of searchParams) {
    url.searchParams.append(key, value);
  }

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
