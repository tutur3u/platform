'use server';

import { fetchWorkspaces as fetchUserWorkspaces } from '@tuturuuu/ui/lib/workspace-actions';

export async function fetchWorkspaces() {
  return fetchUserWorkspaces();
}
