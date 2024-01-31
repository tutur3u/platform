export interface MeetTogetherPlan {
  id?: string;
  title?: string;
  description?: string;
  start_time?: string;
  end_time?: string;
  timezone?: number;
  dates?: string[];
  created_at?: string;
  updated_at?: string;
  creator_id?: string;
}
