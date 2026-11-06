import { isExcludedDrivePath } from './drive-path-policy';
import { isReservedMobileDeploymentDrivePath } from './mobile-deployment/storage-policy';
import { WorkspaceStorageError } from './storage-download-error';

export interface WorkspaceStorageReservedAccessOptions {
  allowReservedMobileDeploymentVault?: boolean;
  driveOnly?: boolean;
}

export function assertWorkspaceStoragePathAllowed(
  wsId: string,
  path: string,
  options?: WorkspaceStorageReservedAccessOptions
) {
  if (options?.driveOnly && isExcludedDrivePath(wsId, path))
    throw new WorkspaceStorageError('Forbidden', 403);
  if (
    !options?.allowReservedMobileDeploymentVault &&
    isReservedMobileDeploymentDrivePath(wsId, path)
  ) {
    throw new WorkspaceStorageError(
      'Mobile deployment vault files are managed by the mobile deployment API.',
      403
    );
  }
}

export function assertWorkspaceStorageMutationPathsAllowed(
  wsId: string,
  fullPaths: string[],
  options?: WorkspaceStorageReservedAccessOptions,
  destination?: { from: string; to: string }
) {
  for (const fullPath of fullPaths) {
    const paths = destination
      ? [fullPath, fullPath.replace(destination.from, destination.to)]
      : [fullPath];
    for (const path of paths) {
      const relativePath = path.startsWith(`${wsId}/`)
        ? path.slice(wsId.length + 1)
        : path;
      assertWorkspaceStoragePathAllowed(wsId, relativePath, options);
    }
  }
}
