/** Packet observations belong to the receiver track, not its participant name. */
const packets = new WeakMap<MediaStreamTrack, boolean>();
export const RECEIVER_PACKET_EVENT = 'meet-receiver-packets';
export function receiverPacketState(track: MediaStreamTrack) {
  return packets.get(track);
}
export function setReceiverPacketState(
  track: MediaStreamTrack,
  receiving: boolean | undefined
) {
  if (packets.get(track) === receiving) return;
  if (receiving === undefined) packets.delete(track);
  else packets.set(track, receiving);
  track.dispatchEvent(new Event(RECEIVER_PACKET_EVENT));
}
export function streamPacketState(
  tracks: MediaStreamTrack[]
): boolean | undefined {
  const live = tracks.filter(
    (track) => track.readyState === 'live' && !track.muted
  );
  if (!live.length) return false;
  if (live.some((track) => packets.get(track) === true)) return true;
  return live.some((track) => packets.get(track) === undefined)
    ? undefined
    : false;
}
