type PrivateWorkspaceDelete = {
  schema(name: 'private'): {
    rpc(
      fn: 'delete_workspace_with_attendance_intent',
      args: { p_ws_id: string; p_plan: unknown }
    ): Promise<{ data: unknown; error: unknown }>;
  };
};

/** Deletes the workspace row and stores the erasure intent in that transaction. */
export async function deleteWorkspaceWithAttendanceIntent(
  sbAdmin: unknown,
  wsId: string,
  plan: unknown
): Promise<{ error: unknown }> {
  const removed = await (sbAdmin as PrivateWorkspaceDelete)
    .schema('private')
    .rpc('delete_workspace_with_attendance_intent', {
      p_ws_id: wsId,
      p_plan: plan,
    });
  if (removed.error) return { error: removed.error };
  if (removed.data !== 'deleted' && removed.data !== 'not_deleted') {
    return { error: new Error('Meet attendance workspace delete failed') };
  }
  if (removed.data === 'deleted' && plan && typeof plan === 'object') {
    const record = plan as { phase?: string; sqlDone?: boolean };
    record.phase = 'confirmed';
    record.sqlDone = true;
  }
  return { error: null };
}
