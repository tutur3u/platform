export interface Timeblock {
  id?: string;
  plan_id?: string;
  user_id?: string;
  date: string;
  start_time: string;
  end_time: string;
  is_guest?: boolean;
  created_at?: string | null;
}
