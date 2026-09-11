export const promptFrameworks = {
  rise: ['role', 'inputs', 'steps', 'output'],
  craft: ['context', 'role', 'action', 'format', 'tone'],
} as const;
export type PromptFramework = keyof typeof promptFrameworks;
export type PromptReview = {
  at: number;
  revision: number;
  framework: PromptFramework;
  summary: string;
  sections: {
    id: string;
    quote: string;
    explanation: string;
    improvement: string;
  }[];
};
