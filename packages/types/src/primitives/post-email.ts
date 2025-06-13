export interface PostEmail {
  id?: string | null;
  subject?: string | null;
  user_id?: string | null;
  recipient?: string | null;
  email?: string | null;
  email_id?: string | null;
  group_id?: string | null;
  group_name?: string | null;
  post_id?: string | null;
  post_title?: string | null;
  post_content?: string | null;
  is_completed?: boolean | null;
  ws_id?: string | null;
  notes?: string | null;
  post_created_at?: string | null;
  created_at?: Date | null;
}
