import { createServerFn } from '@tanstack/react-start';

export const fetchWorkspaces = createServerFn({ method: 'POST' }).handler(
  async () => {
    const { fetchAuthorizedWorkspaces } = await import(
      './legacy-action-ports.server'
    );
    return fetchAuthorizedWorkspaces();
  }
);

export const fetchSatelliteWorkspaces = fetchWorkspaces;
