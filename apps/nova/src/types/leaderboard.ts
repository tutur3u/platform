export interface ChallengeScore {
  challengeId: number;
  challengeName: string;
  score: number;
  rank: number;
  aiReasoning: string;
}

export interface LeaderboardEntry {
  userId: number;
  username: string;
  totalScore: number;
  challengeScores: ChallengeScore[];
}
