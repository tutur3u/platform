import {
  applyMeetRoomSettings,
  type MeetRealtimeTokenPayload,
  meetRoomStateView,
} from '../../../packages/realtime/src/meet';
import { resolveRoomSettingsPatch } from '../../../packages/realtime/src/meet/room-settings-gate';
import type { MeetRoomEnv } from './room-env';
import type { RoomServiceState } from './room-service';

export async function handleMeetRoomState(
  request: Request,
  url: URL,
  token: MeetRealtimeTokenPayload,
  env: MeetRoomEnv,
  state: {
    read: () => RoomServiceState;
    commit: (updated: ReturnType<typeof applyMeetRoomSettings>) => Promise<void>;
  }
) {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (request.method === 'GET' && url.searchParams.get('eventAudit') === '1') {
    if (token.role !== 'host' || !token.eventHost)
      return new Response(null, { status: 403 });
    const snapshot = state.read();
    return Response.json(
      {
        activations: snapshot.eventActivationAudit ?? [],
        admissions: snapshot.eventAdmissionAudit ?? [],
      },
      { headers }
    );
  }
  if (request.method === 'PATCH') {
    const settings = resolveRoomSettingsPatch(
      await request.json().catch(() => null),
      state.read().settings,
      token,
      env
    );
    if (settings instanceof Response) return settings;
    await state.commit(
      applyMeetRoomSettings(
        state.read(),
        settings,
        token,
        new Date().toISOString()
      )
    );
  }
  return Response.json(meetRoomStateView(state.read(), token), { headers });
}
