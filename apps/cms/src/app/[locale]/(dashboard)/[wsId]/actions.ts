'use server';

import {
  listCmsWorkspaces,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { headers } from 'next/headers';

export async function fetchWorkspaces() {
  return listCmsWorkspaces(withForwardedInternalApiAuth(await headers()));
}
