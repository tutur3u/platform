import 'server-only';

export type GuestMeeting = {
  id: string;
  name: string | null;
  creator_id: string;
  ws_id: string;
};

type HostEntry = {
  expires: number;
  result: Promise<GuestMeeting | null>;
};
const entries = new Map<string, HostEntry>();

/** Host entitlement and meeting metadata only, local to this Worker isolate. */
export function invalidateMeetGuestHostCache(meetingId: string) {
  entries.delete(meetingId);
}

export function readMeetGuestHost(
  meetingId: string,
  load: () => Promise<GuestMeeting | null>
): Promise<GuestMeeting | null> {
  const existing = entries.get(meetingId);
  if (existing && existing.expires > Date.now()) return existing.result;
  entries.delete(meetingId);
  if (entries.size >= 500) entries.delete(entries.keys().next().value!);
  const entry: HostEntry = {
    expires: Date.now() + 30_000,
    result: Promise.resolve()
      .then(load)
      .then((meeting) => {
        // A revocation, eviction or replacement during the lookup wins.
        if (entries.get(meetingId) !== entry) return null;
        if (!meeting) entries.delete(meetingId);
        return meeting;
      })
      .catch((error: unknown) => {
        if (entries.get(meetingId) === entry) entries.delete(meetingId);
        throw error;
      }),
  };
  entries.set(meetingId, entry);
  return entry.result;
}
