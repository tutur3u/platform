import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';
import type {
  CanonicalExternalProject,
  ExternalProjectAdapterKind,
  Json,
  WorkspaceExternalProjectBinding,
} from '@tuturuuu/types';

/**
 * What the published delivery route needs to decide between serving the edge
 * cache and building the payload: the binding as the route resolves it, a
 * fingerprint of the inputs the payload derives from, and the workspace's
 * delivery version (bumped by database triggers on every content write).
 */
export type DeliveryState = {
  adapter: ExternalProjectAdapterKind | null;
  bindingFingerprint: string;
  canonicalId: string | null;
  canonicalProject: CanonicalExternalProject | null;
  enabled: boolean;
  settings: Json | null;
  version: number;
};

type DeliveryStateRow = {
  adapter: ExternalProjectAdapterKind | null;
  binding_fingerprint: string | null;
  canonical_id: string | null;
  canonical_project: CanonicalExternalProject | null;
  enabled: boolean | null;
  settings: Json | null;
  version: number | string | null;
};

type PrivateRpcClient = {
  schema(name: 'private'): {
    rpc(
      fn: 'get_external_project_delivery_state',
      args: { p_ws_id: string }
    ): PromiseLike<{
      data: DeliveryStateRow[] | null;
      error: { code?: string; message: string } | null;
    }>;
    from(table: 'workspace_external_project_delivery_versions'): {
      select(columns: 'version'): {
        eq(
          column: 'ws_id',
          value: string
        ): {
          maybeSingle(): PromiseLike<{
            data: { version: number | string | null } | null;
            error: { code?: string; message: string } | null;
          }>;
        };
      };
    };
  };
};

export class DeliveryStateUnavailableError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined
  ) {
    super(message);
    this.name = 'DeliveryStateUnavailableError';
  }
}

/** Postgres and PostgREST codes for a missing function, table or schema. */
const MISSING_OBJECT_CODES = new Set([
  '42883',
  '42P01',
  '3F000',
  'PGRST106',
  'PGRST202',
  'PGRST205',
]);

/** True while the version counter migration is not applied. */
export function isDeliveryStateMissing(error: unknown) {
  return (
    error instanceof DeliveryStateUnavailableError &&
    error.code !== undefined &&
    MISSING_OBJECT_CODES.has(error.code)
  );
}

function toVersion(value: number | string | null | undefined) {
  const version = Number(value ?? 0);
  return Number.isSafeInteger(version) && version >= 0 ? version : 0;
}

export async function readDeliveryState(
  admin: TypedSupabaseClient,
  workspaceId: string
): Promise<DeliveryState> {
  const { data, error } = await (admin as unknown as PrivateRpcClient)
    .schema('private')
    .rpc('get_external_project_delivery_state', { p_ws_id: workspaceId });
  if (error) throw new DeliveryStateUnavailableError(error.message, error.code);
  const row = data?.[0];
  if (!row)
    throw new DeliveryStateUnavailableError(
      'Delivery state returned no row',
      undefined
    );
  return {
    adapter: row.adapter ?? null,
    bindingFingerprint: row.binding_fingerprint ?? '',
    canonicalId: row.canonical_id ?? null,
    canonicalProject: row.canonical_project ?? null,
    enabled: row.enabled === true,
    settings: row.settings ?? null,
    version: toVersion(row.version),
  };
}

/** One primary-key read; 0 until the workspace's first CMS write. */
export async function readDeliveryVersion(
  admin: TypedSupabaseClient,
  workspaceId: string
): Promise<number> {
  const { data, error } = await (admin as unknown as PrivateRpcClient)
    .schema('private')
    .from('workspace_external_project_delivery_versions')
    .select('version')
    .eq('ws_id', workspaceId)
    .maybeSingle();
  if (error) throw new DeliveryStateUnavailableError(error.message, error.code);
  return toVersion(data?.version);
}

export function bindingFromDeliveryState(
  state: DeliveryState,
  workspaceId: string
): WorkspaceExternalProjectBinding {
  return {
    adapter: state.adapter,
    canonical_id: state.canonicalId,
    canonical_project: state.canonicalProject,
    enabled: state.enabled,
    settings: state.settings,
    workspace_id: workspaceId,
  };
}
