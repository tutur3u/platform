import z from 'zod';

export const TestCaseSchema = z.object({
  testCaseEvaluation: z.array(
    z.object({
      id: z.string(),
      matched: z
        .boolean()
        .describe(
          'True if the model output is semantically equivalent to the expected answer'
        ),
      output: z
        .string()
        .describe("The model's generated output for this test case"),
      confidence: z
        .number()
        .min(0)
        .max(1)
        .describe('Confidence level in the match assessment (0-1)'),
      reasoning: z
        .string()
        .describe("Brief explanation of why outputs match or don't match"),
    })
  ),
});
