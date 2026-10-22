import { createServerFn } from '@tanstack/react-start';
export const fetchSatelliteWorkspaces = createServerFn({
  method: 'GET',
}).handler(async () => {
  const { listMailWorkspaces } = await import('./workspace-actions.server');
  return listMailWorkspaces();
});
