/**
 * The Mira box state a participant had when they pressed Join. Joining
 * happens before admission, while no call session can record a choice, so
 * the final state is kept for this tab and recorded right after admission.
 * Until then the participant counts as off. Browser storage can be missing;
 * every access tolerates that and then nothing is recorded.
 */
export type MiraJoinChoice = {
  ticked: boolean;
  textHash: string;
  locale: string;
  joinedAt: number;
};

const key = (meetingId: string) => `meet-mira-join:${meetingId}`;
/** A join that is not admitted within this window is not applied. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;

export function rememberMiraJoinChoice(
  meetingId: string,
  choice: Omit<MiraJoinChoice, 'joinedAt'>
) {
  try {
    sessionStorage.setItem(
      key(meetingId),
      JSON.stringify({ ...choice, joinedAt: Date.now() })
    );
  } catch {
    // Without storage the participant stays off until they choose in the call.
  }
}

function read(meetingId: string): MiraJoinChoice | null {
  try {
    const raw = sessionStorage.getItem(key(meetingId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MiraJoinChoice>;
    if (
      typeof parsed.ticked !== 'boolean' ||
      typeof parsed.textHash !== 'string' ||
      typeof parsed.locale !== 'string' ||
      typeof parsed.joinedAt !== 'number' ||
      Date.now() - parsed.joinedAt > MAX_AGE_MS
    )
      return null;
    return parsed as MiraJoinChoice;
  } catch {
    return null;
  }
}

/** The remembered choice without consuming it, to seed a later join box. */
export function peekMiraJoinChoice(meetingId: string) {
  return read(meetingId);
}

/** Reads and clears the remembered choice, so it is applied once. */
export function takeMiraJoinChoice(meetingId: string) {
  const choice = read(meetingId);
  try {
    sessionStorage.removeItem(key(meetingId));
  } catch {
    // Nothing to clear without storage.
  }
  return choice;
}
