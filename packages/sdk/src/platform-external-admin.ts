import {
  createInternalApiClient,
  encodePathSegment,
  type InternalApiClientOptions,
} from '@tuturuuu/internal-api/client';
import {
  ExternalProjectsUserClient,
  type TuturuuuUserClient,
} from './platform';

export class ExternalClient {
  readonly projects: ExternalProjectsUserClient;
  readonly admin: ExternalAdminClient;
  constructor(client: TuturuuuUserClient) {
    this.projects = new ExternalProjectsUserClient(client);
    this.admin = new ExternalAdminClient(client.getClientOptions());
  }
}

export interface ExternalAppConfiguration {
  id: string;
  displayName: string;
  enabled: boolean;
  origins: string[];
  allowedScopes: string[];
  allowedWorkspaceIds: string[];
}

/** User-authenticated control plane. All operations retain server-side root gates. */
export class ExternalAdminClient {
  private api;
  constructor(options: InternalApiClientOptions) {
    this.api = createInternalApiClient(options);
  }
  apps() {
    return this.api.json<{ apps: ExternalAppConfiguration[] }>(
      '/api/v1/admin/external-apps',
      { cache: 'no-store' }
    );
  }
  saveApp(payload: ExternalAppConfiguration) {
    return this.api.json<{ app: ExternalAppConfiguration }>(
      '/api/v1/admin/external-apps',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, action: 'save' }),
      }
    );
  }
  rotateSecret(id: string) {
    return this.api.json<{ app: ExternalAppConfiguration; secret: string }>(
      '/api/v1/admin/external-apps',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rotate-secret', id }),
      }
    );
  }
  templates() {
    return this.api.json<unknown[]>('/api/v1/admin/external-projects', {
      cache: 'no-store',
    });
  }
  saveTemplate(payload: Record<string, unknown>) {
    return this.api.json<unknown>('/api/v1/admin/external-projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  }
  binding(workspaceId: string) {
    return this.api.json<unknown>(
      `/api/v1/admin/external-project-bindings/${encodePathSegment(workspaceId)}`,
      { cache: 'no-store' }
    );
  }
  bind(workspaceId: string, canonicalId: string) {
    return this.api.json<unknown>(
      `/api/v1/admin/external-project-bindings/${encodePathSegment(workspaceId)}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonicalId }),
      }
    );
  }
}
