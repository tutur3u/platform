import type { MeetRoomFormsEnv } from '../../../packages/realtime/src/meet/room-forms';
import type { MeetSelfOutboxEnv } from '../../../packages/realtime/src/meet/room-self-capture-delivery';
import type { TurnEnv } from './turn-credentials';

export interface MeetRoomEnv
  extends TurnEnv, MeetRoomFormsEnv, MeetSelfOutboxEnv {
  CLOUDFLARE_REALTIME_API_BASE_URL?: string;
  CLOUDFLARE_REALTIME_APP_ID: string;
  CLOUDFLARE_REALTIME_APP_SECRET: string;
  MEET_REALTIME_TOKEN_SECRET: string;
  MEET_ROOM: DurableObjectNamespace;
  MEET_AI_ENABLED_WORKSPACE_IDS?: string; // Server-only. Absent = deny.
  MEET_AI_ALL_WORKSPACES?: string; // only the reviewed value counts
  MEET_AI_DISABLED?: string;
  MEET_AI_DISABLED_WORKSPACE_IDS?: string;
  MEET_AI_PROTECTED_WORKSPACE_IDS?: string;
  /** Stop fence: `true` or `1` halts provider media cleanup calls, writes and alarms. */
  MEET_MEDIA_CLEANUP_DISABLED?: string;
}
