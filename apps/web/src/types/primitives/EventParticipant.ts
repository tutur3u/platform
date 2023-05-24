export interface EventParticipant {
  event_id: string;
  user_id: string;
  type: 'virtual' | 'platform';
  display_name?: string;
  handle?: string;
  role?: string;
  going?: boolean | null;
  created_at?: string;
}
