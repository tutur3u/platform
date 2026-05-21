'use server';

import {
  listWorkspaces,
  withForwardedInternalApiAuth,
} from '@tuturuuu/internal-api';
import { headers } from 'next/headers';

export async function fetchSatelliteWorkspaces() {
  return listWorkspaces(withForwardedInternalApiAuth(await headers()));
}
