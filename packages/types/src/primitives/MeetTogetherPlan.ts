import type { JSONContent } from '@tuturuuu/ui/tiptap';

export interface MeetTogetherPlan {
  id?: string;
  name?: string;
  description?: string;
  start_time?: string;
  enable_unknown_edit?: boolean;
  is_confirm?: boolean;
  where_to_meet?: boolean;
  end_time?: string;
  dates?: string[];
  created_at?: string;
  updated_at?: string;
  creator_id?: string;
  ws_id?: string;
  is_public?: boolean;
  agenda_content?: JSONContent;
}
export interface PollUserVote {
  id: string;
  option_id: string;
  user_id: string;
  created_at: string; // ISO string
}

// Represents a single guest vote on a poll option
export interface PollGuestVote {
  id: string;
  option_id: string;
  guest_id: string;
  created_at: string; // ISO string
}

// A poll option with all its votes
export interface PollOptionWithVotes {
  id: string;
  poll_id: string;
  value: string;
  created_at: string;
  userVotes: PollUserVote[];
  guestVotes: PollGuestVote[];
  totalVotes: number;
}

// A poll with its options, each containing votes
export interface PollWithOptionsAndVotes {
  id: string;
  name: string;
  plan_id: string | null;
  created_at: string;
  creator_id: string;
  allow_anonymous_updates: boolean;
  options: PollOptionWithVotes[];
}

// The full API return type
export interface GetPollsForPlanResult {
  polls: PollWithOptionsAndVotes[] | null;
  userVotes: PollUserVote[]; // Flat array for convenience
  guestVotes: PollGuestVote[]; // Flat array for convenience
  error?: string;
}
