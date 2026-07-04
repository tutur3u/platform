import type { Entity } from './Entity';

export interface UserGroup extends Entity {
  id: string;
  ws_id?: string;
  name: string;
  archived?: boolean;
  is_course_published?: boolean;
  is_guest: boolean;
  amount?: number;
  attendance_amount?: number;
  has_session_today?: boolean;
  sessions?: string[];
  /**
   * Server-computed today-attendance snapshot for the groups table cell.
   * Precomputed in one batched query instead of one fetch per row.
   */
  today_attendance?: {
    available: boolean;
    attended: number;
    absent: number;
    count: number;
  };
  href?: string;
  description?: string;
  starting_date?: string | null;
  ending_date?: string | null;
  notes?: string | null;
  managers?: {
    id: string;
    full_name?: string | null;
    avatar_url?: string | null;
    display_name?: string | null;
    email?: string | null;
    hasLinkedPlatformUser?: boolean;
  }[];
}
