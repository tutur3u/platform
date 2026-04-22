import { CMS_APP_URL } from '@/constants/common';

function trimTrailingSlash(value: string) {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function getCmsUrl(pathname: string) {
  const baseUrl = trimTrailingSlash(CMS_APP_URL);
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${baseUrl}${normalizedPath}`;
}
