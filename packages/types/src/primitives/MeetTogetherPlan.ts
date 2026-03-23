export interface MeetTogetherPlan {
  id?: string;
  name?: string;
  description?: string;
  is_confirmed?: boolean;
  start_time?: string;
  end_time?: string;
  dates?: string[];
  created_at?: string;
  updated_at?: string;
  creator_id?: string;
  is_public?: boolean;
}
