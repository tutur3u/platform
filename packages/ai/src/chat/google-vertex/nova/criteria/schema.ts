import z from 'zod';

export const EvaluationSchema = z.object({
  criteriaEvaluation: z
    .array(
      z.object({
        id: z
          .string()
          .describe(
            'ID of the evaluation criterion from the context (DO NOT HALLUCINATE)'
          ),
        score: z.number().min(0).max(10).describe('Score out of 10'),
        feedback: z
          .string()
          .describe(
            'Detailed feedback for the criterion with specific examples'
          ),
        strengths: z
          .array(z.string())
          .describe('Key strengths related to this criterion'),
        improvements: z
          .array(z.string())
          .describe('Suggestions for improvement related to this criterion'),
      })
    )
    .describe('Array of criteria evaluations'),
});
