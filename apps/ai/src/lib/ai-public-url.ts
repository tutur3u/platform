import { appUrl } from '@tuturuuu/start-bridge/app-url';
import { maybeBridgeRequest } from '@tuturuuu/start-bridge/request-context/core';
import { BASE_URL } from '@/constants/common';

export function createAiPublicUrl(path = '/', request?: Request) {
  const base =
    maybeBridgeRequest()?.request.url ??
    (request && process.env.NODE_ENV !== 'production' ? request.url : BASE_URL);

  return new URL(appUrl(path, base));
}
