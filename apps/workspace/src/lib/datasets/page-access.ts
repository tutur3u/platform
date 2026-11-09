import { notFound, redirect } from 'next/navigation';
import { cache } from 'react';
import { resolveDatasetAccess, resolveDatasetWorkspaceAccess } from './access';

export function denyDatasetPageAccess(response: Response): never {
  // The Start bridge has no `unauthorized()` boundary, so an unauthenticated
  // dataset request is sent to the central login.
  if (response.status === 401) redirect('/login');
  if (response.status === 403 || response.status === 404) notFound();
  throw new Error('Dataset access could not be verified');
}

export const requireDatasetWorkspaceAccess = cache(async (wsId: string) => {
  const access = await resolveDatasetWorkspaceAccess(wsId);
  if (!access.ok) denyDatasetPageAccess(access.response);
  return access;
});

export const requireDatasetAccess = cache(
  async (wsId: string, datasetId: string) => {
    const access = await resolveDatasetAccess(wsId, datasetId);
    if (!access.ok) denyDatasetPageAccess(access.response);
    return access;
  }
);

export { resolveDatasetWorkspaceAccess } from './access';
