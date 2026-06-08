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

export const GeneratedQuizSchema = z.object({
  question: z.string().describe('The quiz question text.'),
  type: z
    .enum(['multiple_choice', 'true_false', 'matching', 'ordering'])
    .describe('The question type.'),
  score: z
    .number()
    .int()
    .min(1)
    .max(10)
    .default(1)
    .describe(
      'Point value for this question (MUST be an integer between 1 and 10, default is 1).'
    ),
  // Multiple choice fields
  options: z
    .array(z.string())
    .min(2)
    .max(6)
    .optional()
    .describe(
      'List of options for multiple choice questions. Required if type is multiple_choice.'
    ),
  correct_option_index: z
    .number()
    .int()
    .nonnegative()
    .optional()
    .describe(
      'Index of the correct option for multiple choice (0-indexed). Required if type is multiple_choice.'
    ),
  // True/false fields
  correct_boolean: z
    .boolean()
    .optional()
    .describe(
      'Correct answer for true/false questions. Required if type is true_false.'
    ),
  // Matching fields
  matching_pairs: z
    .array(
      z.object({
        left: z.string().describe('Left item'),
        right: z.string().describe('Right matched item'),
      })
    )
    .optional()
    .describe(
      'Pairs of items that match each other. Required if type is matching.'
    ),
  // Ordering fields
  ordering_items: z
    .array(z.string())
    .min(2)
    .optional()
    .describe(
      'Items in their correct ordered sequence. Required if type is ordering.'
    ),
  // Universal explanation
  explanation: z
    .string()
    .optional()
    .describe('Explanation of the correct answer.'),
});

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
