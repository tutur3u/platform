import {
  applyWorkspaceExternalProjectSyncManifest,
  diffWorkspaceExternalProjectSyncManifest,
  type ExternalProjectSyncManifest,
  getWorkspaceExternalProjectDelivery,
  getWorkspaceExternalProjectStudio,
  getWorkspaceExternalProjectSummary,
  getWorkspaceExternalProjectSyncSnapshot,
  listWorkspaceExternalProjectCollections,
  listWorkspaceExternalProjectEntries,
  setupWorkspaceExternalProject,
  type WorkspaceExternalProjectSyncApplyPayload,
} from '@tuturuuu/internal-api/external-projects';
import type { TuturuuuUserClient } from './platform';

/** Workspace external-project sync operations for the signed-in user. */
export class ExternalProjectsUserClient {
  constructor(private readonly client: TuturuuuUserClient) {}

  apply(
    workspaceId: string,
    payload: WorkspaceExternalProjectSyncApplyPayload
  ) {
    return applyWorkspaceExternalProjectSyncManifest(
      workspaceId,
      payload,
      this.client.getClientOptions()
    );
  }

  collections(workspaceId: string) {
    return listWorkspaceExternalProjectCollections(
      workspaceId,
      this.client.getClientOptions()
    );
  }

  delivery(workspaceId: string, options?: { preview?: boolean }) {
    return getWorkspaceExternalProjectDelivery(
      workspaceId,
      options?.preview === true,
      this.client.getClientOptions()
    );
  }

  diff(workspaceId: string, manifest: ExternalProjectSyncManifest) {
    return diffWorkspaceExternalProjectSyncManifest(
      workspaceId,
      { manifest },
      this.client.getClientOptions()
    );
  }

  entries(workspaceId: string, options?: { collectionId?: string }) {
    return listWorkspaceExternalProjectEntries(
      workspaceId,
      options,
      this.client.getClientOptions()
    );
  }

  setup(workspaceId: string, manifest: ExternalProjectSyncManifest) {
    return setupWorkspaceExternalProject(
      workspaceId,
      { manifest },
      this.client.getClientOptions()
    );
  }

  snapshot(workspaceId: string) {
    return getWorkspaceExternalProjectSyncSnapshot(
      workspaceId,
      this.client.getClientOptions()
    );
  }

  studio(workspaceId: string) {
    return getWorkspaceExternalProjectStudio(
      workspaceId,
      this.client.getClientOptions()
    );
  }

  summary(workspaceId: string) {
    return getWorkspaceExternalProjectSummary(
      workspaceId,
      this.client.getClientOptions()
    );
  }
}
