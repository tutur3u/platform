import {
  type MeetClassFeatures,
  type MeetRealtimeTokenPayload,
  type MeetRoomOutcome,
  type MeetRoomSnapshot,
  releaseParticipant,
} from '../../../packages/realtime/src/meet';

export async function handleMeetRoomDevice(input: {
  snapshot: MeetRoomSnapshot;
  token: MeetRealtimeTokenPayload;
  features: MeetClassFeatures;
  body: { mode?: string } | null;
  connectionState: () => MeetRoomSnapshot;
  persist: () => Promise<void>;
  scheduleEmptyRoom: () => Promise<void>;
  sendToUser: MeetRoomOutcome extends never
    ? never
    : (
        userId: string,
        messages: Array<{
          type: 'participant.removed';
          by: string;
          userId: string;
        }>
      ) => void;
  broadcast: (messages: MeetRoomOutcome['broadcast']) => void;
  sendToManagers: (messages: MeetRoomOutcome['toManagers']) => void;
  disconnect: (userIds: string[]) => void;
  assign: (snapshot: MeetRoomSnapshot) => void;
}) {
  const accountId = input.token.accountId ?? input.token.userId;
  const others = Object.values(input.snapshot.presence).filter(
    (person) =>
      (person.accountId ?? person.userId) === accountId &&
      person.userId !== input.token.userId
  );
  if (input.body?.mode === 'switch') {
    const released = [];
    let snapshot = input.snapshot;
    for (const person of others) {
      const result = releaseParticipant(
        snapshot,
        person.userId,
        input.token.roomId,
        input.features
      );
      snapshot = result.state;
      released.push({ person, result });
    }
    input.assign(snapshot);
    input.assign(input.connectionState());
    await input.persist();
    await input.scheduleEmptyRoom();
    for (const { person, result } of released) {
      input.sendToUser(person.userId, [
        {
          type: 'participant.removed',
          by: input.token.userId,
          userId: person.userId,
        },
      ]);
      input.broadcast(result.broadcast);
      input.sendToManagers(result.toManagers);
      input.disconnect([person.userId]);
    }
  }
  return Response.json(
    { otherDeviceCount: others.length },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}
