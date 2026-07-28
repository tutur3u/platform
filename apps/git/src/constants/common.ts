import { resolveInternalAppUrl } from '@tuturuuu/utils/app-url';
import { getLocalInternalAppUrl } from '@tuturuuu/utils/internal-domains';

export const LOCALE_COOKIE_NAME = 'NEXT_LOCALE';
export const PORT = process.env.PORT || 7830;
export const CENTRAL_PORT = process.env.CENTRAL_PORT || 7803;

const DEFAULT_GIT_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://git.tuturuuu.com'
    : getLocalInternalAppUrl('git', `http://localhost:${PORT}`);

const DEFAULT_WEB_APP_URL =
  process.env.NODE_ENV === 'production'
    ? 'https://tuturuuu.com'
    : getLocalInternalAppUrl('platform', `http://localhost:${CENTRAL_PORT}`);

export const BASE_URL = resolveInternalAppUrl({
  appName: 'git',
  candidates: [
    process.env.GIT_APP_URL,
    process.env.NEXT_PUBLIC_GIT_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.BASE_URL,
  ],
  fallback: DEFAULT_GIT_APP_URL,
});

export const WEB_APP_URL = resolveInternalAppUrl({
  appName: 'platform',
  candidates: [
    process.env.NEXT_PUBLIC_WEB_APP_URL,
    process.env.WEB_APP_URL,
    process.env.NEXT_PUBLIC_APP_URL,
  ],
  fallback: DEFAULT_WEB_APP_URL,
});

export const GITHUB_API_VERSION = '2022-11-28';
export const BOOTSTRAP_REPOSITORY = {
  archived: false,
  defaultBranch: 'main',
  description:
    'Tuturuuu is an AI-native, open-source workspace for tasks, scheduling, and team collaboration.',
  enabled: true,
  githubRepositoryId: 536896722,
  homepageUrl: 'https://tuturuuu.com',
  id: 'bootstrap-tutur3u-platform',
  name: 'platform',
  owner: 'tutur3u',
  visibility: 'public',
} as const;
