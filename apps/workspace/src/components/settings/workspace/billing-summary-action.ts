'use server';

import {
  getPayWorkspaceBillingSummary,
  withForwardedInternalApiAuth,
  withPayApiBaseUrl,
} from '@tuturuuu/internal-api';
import { headers } from 'next/headers';

export async function loadWorkspaceBillingSummary(wsId: string) {
  const requestHeaders = await headers();
  const payOptions = withPayApiBaseUrl();

  return getPayWorkspaceBillingSummary(
    wsId,
    withForwardedInternalApiAuth(requestHeaders, payOptions)
  );
}
