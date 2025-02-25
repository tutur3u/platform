import { LeaderboardEntry } from '@tuturuuu/types/primitives/leaderboard';

export async function getLeaderboardData(): Promise<LeaderboardEntry[]> {
  // This is a mock function. In a real application, you would fetch this data from an API or database.
  return [
    {
      userId: 1,
      username: 'Alice',
      totalScore: 950,
      challengeScores: [
        {
          challengeId: 1,
          challengeName: 'Text Summarization',
          score: 95,
          rank: 1,
          aiReasoning:
            "Alice's prompt demonstrated exceptional understanding of key information extraction and concise presentation, resulting in highly accurate and readable summaries.",
        },
        {
          challengeId: 2,
          challengeName: 'Sentiment Analysis',
          score: 88,
          rank: 3,
          aiReasoning:
            "While Alice's prompt captured sentiment accurately, there's room for improvement in handling nuanced expressions and context-dependent emotions.",
        },
        {
          challengeId: 3,
          challengeName: 'Code Explanation',
          score: 92,
          rank: 2,
          aiReasoning:
            "Alice's prompt excelled at breaking down complex code into understandable concepts, though it could benefit from more beginner-friendly analogies.",
        },
      ],
    },
    {
      userId: 2,
      username: 'Bob',
      totalScore: 920,
      challengeScores: [
        {
          challengeId: 1,
          challengeName: 'Text Summarization',
          score: 89,
          rank: 3,
          aiReasoning:
            "Bob's prompt was effective in capturing main ideas, but occasionally missed some nuanced details that could have enhanced the summaries.",
        },
        {
          challengeId: 2,
          challengeName: 'Sentiment Analysis',
          score: 94,
          rank: 1,
          aiReasoning:
            "Bob's prompt showed excellent capability in discerning subtle emotional cues and contextual sentiment, leading to highly accurate analysis.",
        },
        {
          challengeId: 3,
          challengeName: 'Code Explanation',
          score: 87,
          rank: 4,
          aiReasoning:
            "While Bob's explanations were technically accurate, the prompt could be improved to generate more accessible explanations for beginners.",
        },
      ],
    },
    {
      userId: 3,
      username: 'Charlie',
      totalScore: 900,
      challengeScores: [
        {
          challengeId: 1,
          challengeName: 'Text Summarization',
          score: 91,
          rank: 2,
          aiReasoning:
            "Charlie's prompt demonstrated a strong balance between conciseness and information retention, though it occasionally overemphasized certain aspects.",
        },
        {
          challengeId: 2,
          challengeName: 'Sentiment Analysis',
          score: 90,
          rank: 2,
          aiReasoning:
            "Charlie's sentiment analysis prompt showed good overall performance, with particular strength in identifying mixed sentiments.",
        },
        {
          challengeId: 3,
          challengeName: 'Code Explanation',
          score: 93,
          rank: 1,
          aiReasoning:
            "Charlie's prompt excelled at generating clear, beginner-friendly explanations with effective use of analogies and step-by-step breakdowns.",
        },
      ],
    },
    {
      userId: 4,
      username: 'Diana',
      totalScore: 885,
      challengeScores: [
        {
          challengeId: 1,
          challengeName: 'Text Summarization',
          score: 87,
          rank: 4,
          aiReasoning:
            "Diana's prompt showed good potential in extracting key points but could improve in maintaining context across longer texts.",
        },
        {
          challengeId: 2,
          challengeName: 'Sentiment Analysis',
          score: 86,
          rank: 4,
          aiReasoning:
            "Diana's approach to sentiment analysis was methodical but sometimes missed subtle emotional undertones in complex scenarios.",
        },
        {
          challengeId: 3,
          challengeName: 'Code Explanation',
          score: 89,
          rank: 3,
          aiReasoning:
            "Diana's explanations were thorough and technically sound, though could benefit from more real-world examples.",
        },
      ],
    },
    {
      userId: 5,
      username: 'Eva',
      totalScore: 870,
      challengeScores: [
        {
          challengeId: 1,
          challengeName: 'Text Summarization',
          score: 85,
          rank: 5,
          aiReasoning:
            "Eva's summaries were concise but occasionally missed important secondary details that provided crucial context.",
        },
        {
          challengeId: 2,
          challengeName: 'Sentiment Analysis',
          score: 88,
          rank: 3,
          aiReasoning:
            'Eva demonstrated strong ability in identifying primary emotions but could improve in detecting subtle sentiment shifts.',
        },
        {
          challengeId: 3,
          challengeName: 'Code Explanation',
          score: 84,
          rank: 5,
          aiReasoning:
            "Eva's code explanations were accurate but could be more engaging and incorporate better examples.",
        },
      ],
    },
    {
      userId: 6,
      username: 'Frank',
      totalScore: 855,
      challengeScores: [
        {
          challengeId: 1,
          challengeName: 'Text Summarization',
          score: 83,
          rank: 6,
          aiReasoning:
            "Frank's summarization approach was solid but needed more focus on maintaining the original text's key messages.",
        },
        {
          challengeId: 2,
          challengeName: 'Sentiment Analysis',
          score: 85,
          rank: 5,
          aiReasoning:
            "Frank's sentiment analysis was generally accurate but sometimes struggled with complex emotional contexts.",
        },
        {
          challengeId: 3,
          challengeName: 'Code Explanation',
          score: 82,
          rank: 6,
          aiReasoning:
            "Frank's explanations were technically correct but could use more clarity and better structure.",
        },
      ],
    },
    {
      userId: 7,
      username: 'Grace',
      totalScore: 840,
      challengeScores: [
        {
          challengeId: 1,
          challengeName: 'Text Summarization',
          score: 81,
          rank: 7,
          aiReasoning:
            "Grace's summaries captured main points but needed better organization and flow between ideas.",
        },
        {
          challengeId: 2,
          challengeName: 'Sentiment Analysis',
          score: 82,
          rank: 6,
          aiReasoning:
            'Grace showed promise in sentiment analysis but needs to improve handling of complex emotional expressions.',
        },
        {
          challengeId: 3,
          challengeName: 'Code Explanation',
          score: 80,
          rank: 7,
          aiReasoning:
            "Grace's code explanations were basic but functional, requiring more depth and technical detail.",
        },
      ],
    },
    {
      userId: 8,
      username: 'Henry',
      totalScore: 825,
      challengeScores: [
        {
          challengeId: 1,
          challengeName: 'Text Summarization',
          score: 79,
          rank: 8,
          aiReasoning:
            "Henry's summarization technique needs refinement in maintaining essential information while being concise.",
        },
        {
          challengeId: 2,
          challengeName: 'Sentiment Analysis',
          score: 80,
          rank: 7,
          aiReasoning:
            "Henry's sentiment analysis showed basic competency but requires more sophistication in handling nuanced cases.",
        },
        {
          challengeId: 3,
          challengeName: 'Code Explanation',
          score: 78,
          rank: 8,
          aiReasoning:
            "Henry's code explanations were straightforward but need more depth and better examples.",
        },
      ],
    },
    {
      userId: 9,
      username: 'Ivy',
      totalScore: 810,
      challengeScores: [
        {
          challengeId: 1,
          challengeName: 'Text Summarization',
          score: 77,
          rank: 9,
          aiReasoning:
            "Ivy's summaries were brief but often missed important contextual details.",
        },
        {
          challengeId: 2,
          challengeName: 'Sentiment Analysis',
          score: 78,
          rank: 8,
          aiReasoning:
            "Ivy's sentiment analysis needs improvement in detecting subtle emotional cues and context.",
        },
        {
          challengeId: 3,
          challengeName: 'Code Explanation',
          score: 76,
          rank: 9,
          aiReasoning:
            "Ivy's code explanations require more clarity and better structure for improved understanding.",
        },
      ],
    },
    {
      userId: 10,
      username: 'Jack',
      totalScore: 795,
      challengeScores: [
        {
          challengeId: 1,
          challengeName: 'Text Summarization',
          score: 75,
          rank: 10,
          aiReasoning:
            "Jack's summarization approach needs significant improvement in maintaining key information while being concise.",
        },
        {
          challengeId: 2,
          challengeName: 'Sentiment Analysis',
          score: 76,
          rank: 9,
          aiReasoning:
            "Jack's sentiment analysis shows basic understanding but requires more sophistication and accuracy.",
        },
        {
          challengeId: 3,
          challengeName: 'Code Explanation',
          score: 74,
          rank: 10,
          aiReasoning:
            "Jack's code explanations need more detail and better examples to effectively convey concepts.",
        },
      ],
    },
    {
      userId: 11,
      username: 'Karen',
      totalScore: 780,
      challengeScores: [
        {
          challengeId: 1,
          challengeName: 'Text Summarization',
          score: 73,
          rank: 11,
          aiReasoning:
            "Karen's summaries need work on balancing brevity with comprehensive coverage of key points.",
        },
        {
          challengeId: 2,
          challengeName: 'Sentiment Analysis',
          score: 74,
          rank: 11,
          aiReasoning:
            "Karen's sentiment analysis requires improvement in identifying contextual clues and emotional nuances.",
        },
        {
          challengeId: 3,
          challengeName: 'Code Explanation',
          score: 72,
          rank: 11,
          aiReasoning:
            "Karen's code explanations would benefit from clearer structure and more detailed breakdowns.",
        },
      ],
    },
    {
      userId: 12,
      username: 'Leo',
      totalScore: 765,
      challengeScores: [
        {
          challengeId: 1,
          challengeName: 'Text Summarization',
          score: 71,
          rank: 12,
          aiReasoning:
            "Leo's summarization skills show potential but need significant refinement in key information extraction.",
        },
        {
          challengeId: 2,
          challengeName: 'Sentiment Analysis',
          score: 72,
          rank: 12,
          aiReasoning:
            "Leo's approach to sentiment analysis needs more sophistication in handling complex emotional scenarios.",
        },
        {
          challengeId: 3,
          challengeName: 'Code Explanation',
          score: 70,
          rank: 12,
          aiReasoning:
            "Leo's code explanations require more depth and better examples to effectively communicate concepts.",
        },
      ],
    },
    {
      userId: 13,
      username: 'Maria',
      totalScore: 750,
      challengeScores: [
        {
          challengeId: 1,
          challengeName: 'Text Summarization',
          score: 69,
          rank: 13,
          aiReasoning:
            "Maria's summaries need improvement in maintaining coherence while capturing essential information.",
        },
        {
          challengeId: 2,
          challengeName: 'Sentiment Analysis',
          score: 70,
          rank: 13,
          aiReasoning:
            "Maria's sentiment analysis shows basic understanding but lacks depth in complex cases.",
        },
        {
          challengeId: 3,
          challengeName: 'Code Explanation',
          score: 68,
          rank: 13,
          aiReasoning:
            "Maria's code explanations need more structure and clearer presentation of concepts.",
        },
      ],
    },
    {
      userId: 14,
      username: 'Nick',
      totalScore: 735,
      challengeScores: [
        {
          challengeId: 1,
          challengeName: 'Text Summarization',
          score: 67,
          rank: 14,
          aiReasoning:
            "Nick's summarization approach requires better focus on key information extraction.",
        },
        {
          challengeId: 2,
          challengeName: 'Sentiment Analysis',
          score: 68,
          rank: 14,
          aiReasoning:
            "Nick's sentiment analysis needs improvement in detecting subtle emotional cues.",
        },
        {
          challengeId: 3,
          challengeName: 'Code Explanation',
          score: 66,
          rank: 14,
          aiReasoning:
            "Nick's code explanations would benefit from more detailed examples and clearer structure.",
        },
      ],
    },
    {
      userId: 15,
      username: 'Oliver',
      totalScore: 720,
      challengeScores: [
        {
          challengeId: 1,
          challengeName: 'Text Summarization',
          score: 65,
          rank: 15,
          aiReasoning:
            "Oliver's summaries need significant improvement in organization and completeness.",
        },
        {
          challengeId: 2,
          challengeName: 'Sentiment Analysis',
          score: 66,
          rank: 15,
          aiReasoning:
            "Oliver's sentiment analysis requires better understanding of emotional context.",
        },
        {
          challengeId: 3,
          challengeName: 'Code Explanation',
          score: 64,
          rank: 15,
          aiReasoning:
            "Oliver's code explanations need more clarity and comprehensive coverage of concepts.",
        },
      ],
    },
    {
      userId: 16,
      username: 'Patricia',
      totalScore: 705,
      challengeScores: [
        {
          challengeId: 1,
          challengeName: 'Text Summarization',
          score: 63,
          rank: 16,
          aiReasoning:
            "Patricia's summarization skills require substantial development in key point identification.",
        },
        {
          challengeId: 2,
          challengeName: 'Sentiment Analysis',
          score: 64,
          rank: 16,
          aiReasoning:
            "Patricia's approach to sentiment analysis needs more refinement in handling complex emotions.",
        },
        {
          challengeId: 3,
          challengeName: 'Code Explanation',
          score: 62,
          rank: 16,
          aiReasoning:
            "Patricia's code explanations require better organization and more detailed examples.",
        },
      ],
    },
    {
      userId: 17,
      username: 'Quinn',
      totalScore: 690,
      challengeScores: [
        {
          challengeId: 1,
          challengeName: 'Text Summarization',
          score: 61,
          rank: 17,
          aiReasoning:
            "Quinn's summaries need work on maintaining coherence and capturing essential details.",
        },
        {
          challengeId: 2,
          challengeName: 'Sentiment Analysis',
          score: 62,
          rank: 17,
          aiReasoning:
            "Quinn's sentiment analysis requires improvement in accuracy and context understanding.",
        },
        {
          challengeId: 3,
          challengeName: 'Code Explanation',
          score: 60,
          rank: 17,
          aiReasoning:
            "Quinn's code explanations need more depth and better presentation of concepts.",
        },
      ],
    },
    {
      userId: 18,
      username: 'Rachel',
      totalScore: 675,
      challengeScores: [
        {
          challengeId: 1,
          challengeName: 'Text Summarization',
          score: 59,
          rank: 18,
          aiReasoning:
            "Rachel's summarization approach needs significant improvement in information extraction.",
        },
        {
          challengeId: 2,
          challengeName: 'Sentiment Analysis',
          score: 60,
          rank: 18,
          aiReasoning:
            "Rachel's sentiment analysis shows basic understanding but lacks sophistication.",
        },
        {
          challengeId: 3,
          challengeName: 'Code Explanation',
          score: 58,
          rank: 18,
          aiReasoning:
            "Rachel's code explanations require more structure and clearer examples.",
        },
      ],
    },
    {
      userId: 19,
      username: 'Sam',
      totalScore: 660,
      challengeScores: [
        {
          challengeId: 1,
          challengeName: 'Text Summarization',
          score: 57,
          rank: 19,
          aiReasoning:
            "Sam's summaries need substantial improvement in organization and completeness.",
        },
        {
          challengeId: 2,
          challengeName: 'Sentiment Analysis',
          score: 58,
          rank: 19,
          aiReasoning:
            "Sam's approach to sentiment analysis requires better understanding of emotional nuances.",
        },
        {
          challengeId: 3,
          challengeName: 'Code Explanation',
          score: 56,
          rank: 19,
          aiReasoning:
            "Sam's code explanations need more comprehensive coverage and better examples.",
        },
      ],
    },
    {
      userId: 20,
      username: 'Tom',
      totalScore: 645,
      challengeScores: [
        {
          challengeId: 1,
          challengeName: 'Text Summarization',
          score: 55,
          rank: 20,
          aiReasoning:
            "Tom's summarization skills require significant development in key information capture.",
        },
        {
          challengeId: 2,
          challengeName: 'Sentiment Analysis',
          score: 56,
          rank: 20,
          aiReasoning:
            "Tom's sentiment analysis needs improvement in accuracy and contextual understanding.",
        },
        {
          challengeId: 3,
          challengeName: 'Code Explanation',
          score: 54,
          rank: 20,
          aiReasoning:
            "Tom's code explanations require better structure and more detailed breakdowns.",
        },
      ],
    },
  ];
}
