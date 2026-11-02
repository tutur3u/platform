import type { Database } from './supabase';

type Project = Database['public']['Tables']['task_projects']['Row'];
export type TaskProjectRelationRow = {
  ticket_number?: number | null;
  created_at?: string | null;
  project:
    | (Pick<Project, 'id' | 'name' | 'status'> &
        Partial<Pick<Project, 'ticket_key'>>)
    | null;
};
