export interface Challenge {
  id?: number;
  title: string;
  topic: string;
  description: string;
  problems: Problems[];
  duration: number;
}

export interface Problems {
  id: string;
  title: string;
  description: string;
  exampleInput: string;
  exampleOutput: string;
  constraints?: string[];
  testcase?: string[];
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
        constraints: [
          '1 ≤ s.length ≤ 3 * 10⁵',
          's consists of printable ASCII characters.',
        ],
        testcase: [
          'The Eiffel Tower is one of the most recognizable landmarks in the world, located in Paris, France, and completed in 1889.',
          'The Eiffel Tower is a famous Paris landmark, completed in 1889.',
        ],
      },
      {
        id: '1b',
        title: 'Summarization While Keeping Dates',
        description:
          'Summarize a text without **removing key numbers or dates**.',
        exampleInput:
          'In 2023, the global AI industry was valued at $150 billion, with an expected growth rate of 40% annually until 2030.',
        exampleOutput:
          'In 2023, AI was a $150B industry, projected to grow 40% yearly until 2030.',
        testcase: [
          'In 1990, the world population was 5.32 billion, and it reached 7.9 billion by 2020.',
          'In 1990, the world population was 5.32B, growing to 7.9B by 2020.',
        ],
      },
    ],
    duration: 60,
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
          'I love this phone! The battery lasts forever, and the camera is amazing.',
        exampleOutput: 'Positive',
        testcase: [
          'I absolutely hate the new software update; it’s so frustrating!',
          'Negative',
          'This is the best concert I’ve ever attended!',
          'Positive',
        ],
      },
      {
        id: '2b',
        title: 'Sarcasm Detection',
        description: 'Identify whether a sentence is **sarcastic or not**.',
        exampleInput: '"Oh great, another Monday! Just what I needed..."',
        exampleOutput: 'Sarcastic',
        testcase: [
          'I love getting stuck in traffic for hours. What a fun way to spend my day!',
          'Sarcastic',
          'I’m thrilled that my package arrived on time.',
          'Not Sarcastic',
        ],
      },
    ],
    duration: 45, 
  },
  {
    id: 3,
    title: 'Code Explanation',
    topic: 'Programming',
    description: 'Explain programming concepts in simple terms.',
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
        testcase: [
          `
for (let i = 1; i <= 3; i++) {
  console.log(i);
}
          `,
          'This loop runs three times, printing numbers from 1 to 3. It starts at `i = 1` and stops when `i` exceeds 3.',
        ],
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
        testcase: [
          `
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
          `,
          'This function calculates the nth Fibonacci number by calling itself twice for each value of n until it reaches the base case where n <= 1.',
        ],
      },
    ],
    duration: 75, // Added duration (in minutes)
  },
];

export function getChallenges(): Challenge[] {
  return challenges;
}

export function getChallenge(id: number): Challenge | undefined {
  return challenges.find((challenge) => challenge.id === id);
}
