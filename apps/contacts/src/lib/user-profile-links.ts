import { WEB_APP_URL } from '@/constants/common';

export function buildExternalUserProfileUrl(
  code: string,
  webAppUrl = WEB_APP_URL
) {
  const url = new URL(
    `/shared/user-profile/${encodeURIComponent(code)}`,
    webAppUrl
  );
  return url.toString().replace(/\/$/u, '');
}
