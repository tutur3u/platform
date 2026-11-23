/**
 * The participant's own Mira box preference for one meeting, shared by every
 * surface in the tab. Joining happens before admission, while no call session
 * can record a choice, so the final Join state is kept here and recorded right
 * after admission; until then the participant counts as off. Every later
 * confirm box starts from it, so an untick is never shown ticked again.
 *
 * It is kept in memory (client navigation into the call keeps it) and in
 * session storage (a reload keeps it). Either can be missing; nothing here
 * throws.
 */
export type MiraJoinChoice = {
  ticked: boolean;
  textHash: string;
  locale: string;
  joinedAt: number;
  /**
   * The acceptance revision open on the join screen (0 when none or
   * unknown). The Join state applies only to that acceptance; -1 marks a
   * preference that never applies.
   */
  seenRevision: number;
  /** The acceptance revision this Join state was recorded for, once. */
  appliedRevision?: number;
};

const key = (meetingId: string) => `meet-mira-join:${meetingId}`;
/** A Join that is not admitted within this window is not applied. */
const MAX_AGE_MS = 6 * 60 * 60 * 1000;
const memory = new Map<string, MiraJoinChoice>();

function store(meetingId: string, choice: MiraJoinChoice) {
  memory.set(meetingId, choice);
  try {
    sessionStorage.setItem(key(meetingId), JSON.stringify(choice));
  } catch {
    // Memory keeps it for this page.
  }
}

function fromStorage(meetingId: string): MiraJoinChoice | null {
  try {
    const raw = sessionStorage.getItem(key(meetingId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MiraJoinChoice>;
    if (
      typeof parsed.ticked !== 'boolean' ||
      typeof parsed.textHash !== 'string' ||
      typeof parsed.locale !== 'string' ||
      typeof parsed.joinedAt !== 'number'
    )
      return null;
    return {
      ...parsed,
      seenRevision:
        typeof parsed.seenRevision === 'number' ? parsed.seenRevision : 0,
    } as MiraJoinChoice;
  } catch {
    return null;
  }
}

export function rememberMiraJoinChoice(
  meetingId: string,
  choice: Omit<MiraJoinChoice, 'joinedAt' | 'appliedRevision'>
) {
  store(meetingId, { ...choice, joinedAt: Date.now() });
}

/** The remembered Join state, without consuming it. */
export function peekMiraJoinChoice(meetingId: string) {
  const choice = memory.get(meetingId) ?? fromStorage(meetingId);
  if (!choice || Date.now() - choice.joinedAt > MAX_AGE_MS) return null;
  return choice;
}

/** Marks the Join state recorded for one acceptance, so it applies once. */
export function markMiraJoinChoiceApplied(meetingId: string, revision: number) {
  const choice = peekMiraJoinChoice(meetingId);
  if (choice) store(meetingId, { ...choice, appliedRevision: revision });
}

/**
 * Keeps the participant's latest own choice as the preset for later boxes:
 * turning Mira off in the call keeps every later box unticked. A choice made
 * in the call replaces the Join state outright, so the Join notice hash and
 * revision never apply to it afterwards.
 */
export function rememberMiraPreference(meetingId: string, ticked: boolean) {
  store(meetingId, {
    textHash: '',
    locale: peekMiraJoinChoice(meetingId)?.locale ?? '',
    joinedAt: Date.now(),
    seenRevision: -1,
    ticked,
  });
}

/** True when the participant's own latest box state for this meeting is off. */
export function prefersMiraOff(meetingId: string) {
  return peekMiraJoinChoice(meetingId)?.ticked === false;
}

/** Forgets the meeting's preference, such as after leaving it. */
export function forgetMiraJoinChoice(meetingId: string) {
  memory.delete(meetingId);
  try {
    sessionStorage.removeItem(key(meetingId));
  } catch {
    // Nothing stored without storage.
  }
}
