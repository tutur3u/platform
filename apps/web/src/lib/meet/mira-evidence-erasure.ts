type RpcResult = { data: unknown; error: unknown };

type Query = PromiseLike<{ data?: unknown; error: unknown }> & {
  eq(column: string, value: unknown): Query;
  select(columns: string): Query;
};

type AdminClient = {
  schema(name: 'private'): {
    rpc(fn: string, args: Record<string, unknown>): Promise<RpcResult>;
  };
  from(table: string): { delete(): Query };
};

const admin = (sbAdmin: unknown) => sbAdmin as AdminClient;
const privateRpc = (sbAdmin: unknown) => admin(sbAdmin).schema('private');

/**
 * The database function does not exist yet. Web can deploy before the
 * migration that adds it, so callers fall back to a bare delete, which the
 * evidence tables' RESTRICT still guards: it removes nothing it should not.
 */
function isMissingFunction(error: unknown) {
  const code =
    typeof error === 'object' && error !== null
      ? (error as { code?: unknown }).code
      : undefined;
  return code === 'PGRST202' || code === '42883';
}

/**
 * Deletes one meeting and erases its Meet Mira consent evidence in one
 * transaction. The evidence blocks a bare delete, so every delete that does
 * not carry a Meet attendance intent goes through here. The caller has already
 * authorized the delete.
 */
export async function deleteMeetingErasingMira(
  sbAdmin: unknown,
  wsId: string,
  meetingId: string
): Promise<{ data: 'deleted' | 'not_deleted' | null; error: unknown }> {
  const removed = await privateRpc(sbAdmin).rpc('delete_meeting_erasing_mira', {
    p_ws_id: wsId,
    p_meeting_id: meetingId,
  });
  if (isMissingFunction(removed.error)) {
    const bare = await admin(sbAdmin)
      .from('workspace_meetings')
      .delete()
      .eq('id', meetingId)
      .eq('ws_id', wsId)
      .select('id');
    if (bare.error) return { data: null, error: bare.error };
    return {
      data:
        Array.isArray(bare.data) && bare.data.length
          ? 'deleted'
          : 'not_deleted',
      error: null,
    };
  }
  if (removed.error) return { data: null, error: removed.error };
  if (removed.data !== 'deleted' && removed.data !== 'not_deleted')
    return {
      data: null,
      error: new Error('Meeting delete returned an unexpected result'),
    };
  return { data: removed.data, error: null };
}

/**
 * Deletes one workspace and erases its Meet Mira consent evidence in one
 * transaction. A workspace that is already gone, or a Personal workspace when
 * `onlyNonPersonal` is set, is left alone without an error, as a filtered
 * delete would.
 */
export async function deleteWorkspaceErasingMira(
  sbAdmin: unknown,
  wsId: string,
  options: { onlyNonPersonal?: boolean } = {}
): Promise<{ error: unknown }> {
  const removed = await privateRpc(sbAdmin).rpc(
    'delete_workspace_erasing_mira',
    {
      p_ws_id: wsId,
      p_only_non_personal: options.onlyNonPersonal === true,
    }
  );
  if (isMissingFunction(removed.error)) {
    let bare = admin(sbAdmin).from('workspaces').delete().eq('id', wsId);
    if (options.onlyNonPersonal) bare = bare.eq('personal', false);
    return { error: (await bare).error };
  }
  if (removed.error) return { error: removed.error };
  if (removed.data !== 'deleted' && removed.data !== 'not_deleted')
    return {
      error: new Error('Workspace delete returned an unexpected result'),
    };
  return { error: null };
}
