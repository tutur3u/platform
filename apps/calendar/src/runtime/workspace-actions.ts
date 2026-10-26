import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';

export const workspaceReadInput = z.object({}).strict();

const readWorkspaces = createServerFn({ method: 'POST' })
  .validator(workspaceReadInput)
  .handler(async () => {
    const { fetchAuthorizedWorkspaces } = await import(
      './legacy-action-ports.server'
    );
    return fetchAuthorizedWorkspaces();
  });

export function fetchWorkspaces() {
  return readWorkspaces({ data: {} });
}

export const fetchSatelliteWorkspaces = fetchWorkspaces;
