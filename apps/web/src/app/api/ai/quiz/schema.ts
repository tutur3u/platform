import { z } from 'zod';

export const QUIZ_GENERATION_PROMPT = `You are an expert Academic Curriculum Designer and Subject Matter Expert. Your goal is to transform lesson content into a set of high-quality, structured, and specific quizzes.

### GUIDELINES FOR DEPTH & SPECIFICITY:
1. **Rigor and Fact-Driven Content:** Do NOT write generic questions or high-level definitions. If the lesson content contains code snippets, formulas, specific rules, steps, or constraints, incorporate them directly into the quiz questions.
2. **Pedagogy:** Ensure each question tests a clear learning objective based on the lesson content.
3. **Format Options:**
   - Generate ONLY the question types requested.
   - At least one correct answer must be specified for each question.
   - Include clear explanations for the answers if possible.
   - The score field MUST be an integer between 1 and 10 (do NOT generate extremely large numbers).`;

const BaseQuizSchema = z.object({
  question: z.string().describe('The quiz question text.'),
  score: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(1)
    .describe(
      'Point value for this question (MUST be an integer between 1 and 10, default is 1).'
    ),
  explanation: z
    .string()
    .optional()
    .describe('Explanation of the correct answer.'),
});

export const GeneratedQuizSchema = z.discriminatedUnion('type', [
  BaseQuizSchema.extend({
    type: z.literal('multiple_choice').describe('The question type.'),
    options: z
      .array(z.string())
      .min(2)
      .max(6)
      .describe('List of options for multiple choice questions.'),
    correct_option_index: z
      .number()
      .int()
      .nonnegative()
      .describe('Index of the correct option for multiple choice (0-indexed).'),
  }).superRefine((data, ctx) => {
    if (data.correct_option_index >= data.options.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'correct_option_index must be less than the number of options',
        path: ['correct_option_index'],
      });
    }
  }),
  BaseQuizSchema.extend({
    type: z.literal('true_false').describe('The question type.'),
    correct_boolean: z
      .boolean()
      .describe('Correct answer for true/false questions.'),
  }),
  BaseQuizSchema.extend({
    type: z.literal('matching').describe('The question type.'),
    matching_pairs: z
      .array(
        z.object({
          left: z.string().describe('Left item'),
          right: z.string().describe('Right matched item'),
        })
      )
      .min(1)
      .describe('Pairs of items that match each other.'),
  }),
  BaseQuizSchema.extend({
    type: z.literal('ordering').describe('The question type.'),
    ordering_items: z
      .array(z.string())
      .min(2)
      .describe('Items in their correct ordered sequence.'),
  }),
]);

export const QuizGenerationSchema = z.object({
  quizzes: z
    .array(GeneratedQuizSchema)
    .min(1)
    .describe('A list of quizzes generated based on the lesson content.'),
});

export const GenerateQuizRequestSchema = z.object({
  lessonId: z.string().uuid(),
  wsId: z.string().min(1),
  context: z.string().max(4000).optional(),
  questionType: z
    .enum(['multiple_choice', 'true_false', 'matching', 'ordering', 'mix'])
    .default('mix'),
  count: z.number().int().min(1).max(20).default(5),
});
