export interface Challenge {
  id: number
  title: string
  topic: string
  description: string
  exampleInput: string
  exampleOutput: string
}



const challenges: Challenge[] = [
  {
    id: 1,
    title: 'Text Summarization',
    topic: 'Summarization',
    description: 'Create a prompt that summarizes a given text while maintaining key information and context.',
    exampleInput: 'The Industrial Revolution was a period of major industrialization and innovation during the late 18th and early 19th century. The Industrial Revolution began in Great Britain and quickly spread throughout the world. This time period saw the mechanization of agriculture and textile manufacturing and a revolution in power, including steam ships and railroads, that affected social, cultural and economic conditions.',
    exampleOutput: 'The Industrial Revolution, occurring in the late 18th and early 19th centuries, was a time of significant technological and societal change. It started in Great Britain and spread globally, bringing mechanization to agriculture and textiles, and innovations in power like steam ships and railroads. These advancements had far-reaching impacts on society, culture, and the economy.'
  },
  {
    id: 2,
    title: 'Sentiment Analysis',
    topic: 'Classification',
    description: 'Design a prompt that analyzes the sentiment of a given text, classifying it as positive, negative, or neutral.',
    exampleInput: "I absolutely loved the new restaurant downtown. The food was delicious and the service was impeccable. I can't wait to go back!",
    exampleOutput: 'This text expresses a very positive sentiment. The author uses enthusiastic language such as "absolutely loved" and "can\'t wait to go back". They praise both the food ("delicious") and the service ("impeccable"), indicating a highly satisfactory experience. Overall, this review conveys strong approval and excitement about the restaurant.'
  },
  {
    id: 3,
    title: 'Code Explanation',
    topic: 'Programming',
    description: 'Create a prompt that explains a given piece of code in simple terms, suitable for beginners.',
    exampleInput: `
def fibonacci(n):
    if n <= 1:
        return n
    else:
        return fibonacci(n-1) + fibonacci(n-2)
    `,
    exampleOutput: 'This code defines a function called "fibonacci" that calculates the nth number in the Fibonacci sequence. The Fibonacci sequence is a series of numbers where each number is the sum of the two preceding ones. The function uses recursion, which means it calls itself with smaller values until it reaches the base case (n <= 1). For larger values of n, it calculates the Fibonacci number by adding the two previous numbers in the sequence. This recursive approach, while simple to understand, can be inefficient for large values of n due to repeated calculations.'
  },
]

export function getChallenges(): Challenge[] {
  return challenges
}

export function getChallenge(id: number): Challenge | undefined {
  return challenges.find(challenge => challenge.id === id)
}

