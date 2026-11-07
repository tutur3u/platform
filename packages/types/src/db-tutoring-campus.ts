import type { Database, Tables } from './supabase';

/** Additive campus contract; retain until full-schema regeneration is admitted. */
export type TutoringSessionCampusRow = Omit<
  Database['private']['Tables']['workspace_tutoring_sessions']['Row'],
  'tutor_comment'
> & { campus_override: string | null };

export type TutoringSessionCampusUpdate =
  Database['private']['Tables']['workspace_tutoring_sessions']['Update'] & {
    campus_override?: string | null;
  };

export type TutoringSessionCampusPreview = Pick<
  TutoringSessionCampusRow,
  | 'id'
  | 'reason_type'
  | 'session_date'
  | 'start_time'
  | 'duration_minutes'
  | 'group_id'
  | 'student_user_id'
  | 'teacher_user_id'
  | 'campus_override'
>;

export type WorkspaceTutoringSession = Tables<
  { schema: 'private' },
  'workspace_tutoring_sessions'
> & {
  attendance_status: 'PENDING' | 'DONE' | 'NO_SHOW' | 'CANCELLED';
  reason_type: 'ABSENT_RECOVERY' | 'WEAK_SUPPORT' | 'CUSTOM';
};

// Bind only admitted campus writers until full-schema type generation is available.
type GeneratedTutoringSessionTable =
  Database['private']['Tables']['workspace_tutoring_sessions'];

type CampusTutoringSessionTable = Omit<
  GeneratedTutoringSessionTable,
  'Row' | 'Insert' | 'Update'
> & {
  Row: GeneratedTutoringSessionTable['Row'] & {
    campus_override: string | null;
  };
  Insert: GeneratedTutoringSessionTable['Insert'] & {
    campus_override?: string | null;
  };
  Update: TutoringSessionCampusUpdate;
};

export type TutoringSessionCampusDatabase = Omit<Database, 'private'> & {
  private: Omit<Database['private'], 'Tables'> & {
    Tables: Omit<
      Database['private']['Tables'],
      'workspace_tutoring_sessions'
    > & {
      workspace_tutoring_sessions: CampusTutoringSessionTable;
    };
  };
};
