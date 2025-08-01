export interface PollOption {
  id: string;
  poll_id: string;
  value: string;
  created_at: string;
}
export interface UserVote {
  id: string;
  option_id: string;
  user_id: string;
  created_at: string;
}
export interface GuestVote {
  id: string;
  option_id: string;
  guest_id: string;
  created_at: string;
}

// A poll option with all its votes
export interface PollOptionWithVotes {
  id: string;
  poll_id: string;
  value: string;
  created_at: string;
  userVotes: UserVote[];
  guestVotes: GuestVote[];
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
  userVotes: UserVote[]; // Flat array for convenience
  guestVotes: GuestVote[]; // Flat array for convenience
  error?: string;
}
