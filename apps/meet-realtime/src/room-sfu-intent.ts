import type {
  CloudflareSfuClient,
  MeetSfuIntent,
} from '../../../packages/realtime/src/meet';
import { getSessionIceServers, type TurnEnv } from './turn-credentials';

export async function runRoomSfuIntent(
  client: CloudflareSfuClient,
  env: TurnEnv,
  { message }: MeetSfuIntent
) {
  if (message.type === 'sfu.session.create') {
    const [session, iceServers] = await Promise.all([
      client.createSession(message.sessionDescription),
      getSessionIceServers(env),
    ]);
    if (!session || typeof session !== 'object' || Array.isArray(session))
      throw new Error('Invalid SFU session response');
    return { ...session, iceServers };
  }
  if (
    message.type === 'sfu.tracks.publish' ||
    message.type === 'sfu.tracks.subscribe'
  )
    return client.addTracks(message);
  if (message.type === 'sfu.renegotiate') return client.renegotiate(message);
  return client.closeTracks(message);
}
