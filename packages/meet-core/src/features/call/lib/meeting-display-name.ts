/**
 * Defaults earlier clients stored as the name of a meeting created without
 * one, in every locale Meet has shipped. A stored name equal to one of these
 * is a default, not a title someone chose, so it renders in the viewer's
 * locale instead of the creator's.
 */
export const STORED_DEFAULT_MEETING_NAMES: readonly string[] = [
  'Untitled meeting',
  'Cuộc họp chưa đặt tên',
];

/**
 * Compares in Unicode NFC on both sides, so a default stored with decomposed
 * Vietnamese diacritics still matches.
 */
export function isStoredDefaultMeetingName(name: string) {
  const stored = name.trim().normalize('NFC');
  return STORED_DEFAULT_MEETING_NAMES.some(
    (known) => known.normalize('NFC') === stored
  );
}

/**
 * The meeting name to show this viewer. A missing, blank or known default
 * name becomes `untitled`, the viewer-locale default; any other stored name
 * is a chosen title and is returned verbatim.
 */
export function meetingDisplayName(
  name: string | null | undefined,
  untitled: string
) {
  if (!name?.trim() || isStoredDefaultMeetingName(name)) return untitled;
  return name;
}
