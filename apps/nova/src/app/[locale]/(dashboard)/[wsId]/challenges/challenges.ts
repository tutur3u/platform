export interface Challenge {
  id: number;
  title: string;
  topic: string;
  description: string;
  problems: Problems[];
}

export interface Problems {
  id: string;
  title: string;
  description: string;
  exampleInput: string;
  exampleOutput: string;
}

const challenges: Challenge[] = [
  {
    id: 1,
    title: 'Text Suma',
    topic: 'Summarization',
    description:
      'Create prompts that summarize text while maintaining key details and context.',
    problems: [
      {
        id: '1a',
        title: 'One-Sentence Summary',
        description: 'Summarize a given text in just **one sentence**.',
        exampleInput:
          'The Industrial Revolution was a period of major industrialization and innovation during the late 18th and early 19th century. It started in Great Britain and spread worldwide, introducing mechanized agriculture, textile manufacturing, and steam-powered transportation.',
        exampleOutput:
          'The Industrial Revolution transformed industry with mechanization, starting in Britain and spreading globally.',
      },
      {
        id: '1b',
        title: 'Summarization While Keeping Dates',
        description: 'Summarize a text without **removing key numbers or dates**.',
        exampleInput:
          'In 2023, the global AI industry was valued at $150 billion, with an expected growth rate of 40% annually until 2030.',
        exampleOutput:
          'In 2023, AI was a $150B industry, projected to grow 40% yearly until 2030.',
      },
    ],
  },
  {
    id: 2,
    title: 'Sentiment Analysis',
    topic: 'Classification',
    description:
      'Analyze the sentiment of text and classify it as positive, negative, or neutral.',
    problems: [
      {
        id: '2a',
        title: 'Positive vs. Negative Sentiment',
        description: 'Classify a given text as **positive or negative**.',
        exampleInput:
          "I love this phone! The battery lasts forever, and the camera is amazing.",
        exampleOutput: 'Positive',
      },
      {
        id: '2b',
        title: 'Sarcasm Detection',
        description: 'Identify whether a sentence is **sarcastic or not**.',
        exampleInput: '"Oh great, another Monday! Just what I needed..."',
        exampleOutput: 'Sarcastic',
      },
    ],
  },
  {
    id: 3,
    title: 'Code Explanation',
    topic: 'Programming',
    description:
      'Explain programming concepts in simple terms.',
    problems: [
      {
        id: '3a',
        title: 'Explain a For Loop',
        description:
          'Explain the function of a **for loop** in a beginner-friendly way.',
        exampleInput: `
for (let i = 0; i < 5; i++) {
    console.log(i);
}
        `,
        exampleOutput:
          'This loop runs five times, printing numbers from 0 to 4. It starts at `i = 0`, increases `i` by 1 each time, and stops at `i = 5`.',
      },
      {
        id: '3b',
        title: 'Explain Recursion',
        description: 'Explain **recursion** using a simple example.',
        exampleInput: `
function factorial(n) {
  if (n === 1) return 1;
  return n * factorial(n - 1);
}
        `,
        exampleOutput:
          'This function calculates the factorial of a number by calling itself repeatedly until it reaches the base case (`n === 1`).',
      },
    ],
  },
];

export function getChallenges(): Challenge[] {
  return challenges;
}

export function getChallenge(id: number): Challenge | undefined {
  return challenges.find((challenge) => challenge.id === id);
}
