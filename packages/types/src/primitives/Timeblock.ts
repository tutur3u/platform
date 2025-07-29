export interface Timeblock {
  id?: string;
  plan_id?: string;
  user_id?: string | null;
  date: string;
  start_time: string;
  end_time: string;
  tentative: boolean;
  is_guest?: boolean;
  created_at?: string | null;
}
