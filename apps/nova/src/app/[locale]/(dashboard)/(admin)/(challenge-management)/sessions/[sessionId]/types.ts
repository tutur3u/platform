export interface SessionUser {
  id: string;
  displayName: string;
  avatarUrl: string;
  email: string | null;
}

export interface SessionChallenge {
  id: string;
  title: string;
  description: string;
}

export interface SessionSubmission {
  id: string;
  problemId: string;
  problemTitle: string;
  score: number;
  createdAt: string;
}

export interface SessionData {
  id: string;
  status: string;
  startTime: string;
  endTime: string | null;
  createdAt: string;
  user: SessionUser;
  challenge: SessionChallenge;
  submissions: SessionSubmission[];
}
