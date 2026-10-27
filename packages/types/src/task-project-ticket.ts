import type { Database } from './supabase';

type Project = Database['public']['Tables']['task_projects']['Row'];
export type TaskProjectRelationRow = {
  ticket_number?: number;
  created_at?: string;
  project:
    | (Pick<Project, 'id' | 'name' | 'status'> &
        Partial<Pick<Project, 'ticket_key'>>)
    | null;
};
