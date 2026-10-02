'use client';

import { useVisibleWorkspaces } from '@tuturuuu/ui/hooks/use-visible-workspaces';

export function useUserWorkspaces({
  enabled = true,
}: {
  enabled?: boolean;
} = {}) {
  return useVisibleWorkspaces(enabled);
}
