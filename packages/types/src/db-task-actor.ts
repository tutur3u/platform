import type { Database } from './supabase';

type TaskActorRpcName =
  | 'add_task_label_with_actor'
  | 'link_task_project_with_actor'
  | 'remove_task_label_with_actor'
  | 'unlink_task_project_with_actor'
  | 'update_task_fields_with_actor'
  | 'update_task_with_relations';

export type TaskActorRpcArgs<T extends TaskActorRpcName> = Omit<
  Database['public']['Functions'][T]['Args'],
  'p_actor_user_id'
> & {
  p_actor_user_id: string;
};
