import { appUrl } from '@tuturuuu/start-bridge/app-url';
import { maybeBridgeRequest } from '@tuturuuu/start-bridge/request-context/core';
import { BASE_URL } from '@/constants/common';

export function createStorefrontPublicUrl(path: string) {
  return new URL(appUrl(path, maybeBridgeRequest()?.request.url ?? BASE_URL));
}
