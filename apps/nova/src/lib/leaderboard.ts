import { LeaderboardEntry } from '@/types/leaderboard'

export async function getLeaderboardData(): Promise<LeaderboardEntry[]> {
  // This is a mock function. In a real application, you would fetch this data from an API or database.
  return [
    {
      userId: 1,
      username: "Alice",
      totalScore: 950,
      challengeScores: [
        {
          challengeId: 1,
          challengeName: "Text Summarization",
          score: 95,
          rank: 1,
          aiReasoning: "Alice's prompt demonstrated exceptional understanding of key information extraction and concise presentation, resulting in highly accurate and readable summaries."
        },
        {
          challengeId: 2,
          challengeName: "Sentiment Analysis",
          score: 88,
          rank: 3,
          aiReasoning: "While Alice's prompt captured sentiment accurately, there's room for improvement in handling nuanced expressions and context-dependent emotions."
        },
        {
          challengeId: 3,
          challengeName: "Code Explanation",
          score: 92,
          rank: 2,
          aiReasoning: "Alice's prompt excelled at breaking down complex code into understandable concepts, though it could benefit from more beginner-friendly analogies."
        }
      ]
    },
    {
      userId: 2,
      username: "Bob",
      totalScore: 920,
      challengeScores: [
        {
          challengeId: 1,
          challengeName: "Text Summarization",
          score: 89,
          rank: 3,
          aiReasoning: "Bob's prompt was effective in capturing main ideas, but occasionally missed some nuanced details that could have enhanced the summaries."
        },
        {
          challengeId: 2,
          challengeName: "Sentiment Analysis",
          score: 94,
          rank: 1,
          aiReasoning: "Bob's prompt showed excellent capability in discerning subtle emotional cues and contextual sentiment, leading to highly accurate analysis."
        },
        {
          challengeId: 3,
          challengeName: "Code Explanation",
          score: 87,
          rank: 4,
          aiReasoning: "While Bob's explanations were technically accurate, the prompt could be improved to generate more accessible explanations for beginners."
        }
      ]
    },
    {
      userId: 3,
      username: "Charlie",
      totalScore: 930,
      challengeScores: [
        {
          challengeId: 1,
          challengeName: "Text Summarization",
          score: 91,
          rank: 2,
          aiReasoning: "Charlie's prompt demonstrated a strong balance between conciseness and information retention, though it occasionally overemphasized certain aspects."
        },
        {
          challengeId: 2,
          challengeName: "Sentiment Analysis",
          score: 90,
          rank: 2,
          aiReasoning: "Charlie's sentiment analysis prompt showed good overall performance, with particular strength in identifying mixed sentiments."
        },
        {
          challengeId: 3,
          challengeName: "Code Explanation",
          score: 93,
          rank: 1,
          aiReasoning: "Charlie's prompt excelled at generating clear, beginner-friendly explanations with effective use of analogies and step-by-step breakdowns."
        }
      ]
    }
  ]
}

