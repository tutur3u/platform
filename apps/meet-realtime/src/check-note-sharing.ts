/** A dedicated synthetic UUID with no database row; never a customer workspace. */
export function notesCanaryWorkspace(raw: string | undefined) {
  if (raw === undefined) return undefined;
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(raw))
    throw new Error(
      'MEET_CHECK_NOTES_CANARY_WS_ID must be a dedicated fake UUID'
    );
  return raw;
}

/** Always prove revocation succeeds, including when enable is denied. */
export async function checkNoteSharing(
  policy: (settings: Record<string, boolean>) => Promise<Response>,
  field: 'shareNotes' | 'shareNotesAfterMeeting',
  canary: boolean
) {
  const enabled = await policy({ [field]: true });
  const disabled = await policy({ [field]: false });
  return (canary ? enabled.ok : enabled.status === 403) && disabled.ok;
}
