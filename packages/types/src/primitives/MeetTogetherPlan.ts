import type { JSONContent } from '@tuturuuu/ui/tiptap';

export interface MeetTogetherPlan {
  id?: string;
  name?: string;
  description?: string;
  start_time?: string;
  where_to_meet?: boolean;
  end_time?: string;
  dates?: string[];
  created_at?: string;
  updated_at?: string;
  creator_id?: string;
  ws_id?: string;
  is_public?: boolean;
  agenda_content?: JSONContent;
}

export interface PlanUser {
  id: string | null;
  display_name: string | null;
  is_guest: boolean | null;
  timeblock_count: number | null;
}

export interface GuestUser {
  id?: string | null;
  display_name?: string | null;
  password_hash?: string;
  is_guest?: boolean | null;
}
