import type { SupabaseUser } from '@tuturuuu/supabase/next/user';
import type { TypedSupabaseClient } from '@tuturuuu/supabase/types';

export type Db = TypedSupabaseClient;

export type TulearnRole = 'student' | 'parent';

export interface TulearnWorkspaceSummary {
  id: string;
  name: string | null;
  avatar_url: string | null;
  logo_url: string | null;
  roles: TulearnRole[];
}

export interface TulearnStudentSummary {
  id: string;
  platform_user_id: string;
  workspace_user_id: string;
  workspace_id: string;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export interface TulearnSubject {
  role: TulearnRole;
  readOnly: boolean;
  wsId: string;
  studentPlatformUserId: string;
  studentWorkspaceUserId: string;
  studentName: string | null;
}

export interface TulearnState {
  hearts: number;
  max_hearts: number;
  xp_total: number;
  current_streak: number;
  longest_streak: number;
  streak_freezes: number;
  last_activity_date: string | null;
}

export interface ResolveTulearnSubjectInput {
  requestSupabase: Db;
  studentId?: string | null;
  user: SupabaseUser;
  wsId: string;
}

export interface TulearnBootstrapInput {
  requestSupabase: Db;
  user: SupabaseUser;
}

export type TulearnXpSourceType =
  | 'assignment'
  | 'daily_goal'
  | 'flashcard'
  | 'manual'
  | 'module'
  | 'quiz'
  | 'quiz_set';
