'use server';

import { fetchWorkspaces as _fetchWorkspaces } from '@tuturuuu/ui/lib/workspace-actions';

export async function fetchWorkspaces() {
  return _fetchWorkspaces();
}
