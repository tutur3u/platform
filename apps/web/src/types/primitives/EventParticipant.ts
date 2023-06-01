export type EventParticipantType =
  | 'platform_user'
  | 'virtual_user'
  | 'user_group';

export interface EventParticipant {
  event_id: string;
  participant_id: string;
  type: EventParticipantType;
  display_name?: string;
  handle?: string;
  role?: string;
  going?: boolean | null;
  created_at?: string;
}
