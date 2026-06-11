import { z } from 'zod';

export const QUIZ_GENERATION_PROMPT = `You are an expert Academic Curriculum Designer and Subject Matter Expert. Your goal is to transform lesson content into a set of high-quality, structured, and specific quizzes.

### GUIDELINES FOR DEPTH & SPECIFICITY:
1. **Rigor and Fact-Driven Content:** Do NOT write generic questions or high-level definitions. If the lesson content contains code snippets, formulas, specific rules, steps, or constraints, incorporate them directly into the quiz questions.
2. **Pedagogy:** Ensure each question tests a clear learning objective based on the lesson content.
3. **Format Options:**
   - Generate ONLY the question types requested.
   - At least one correct answer must be specified for each question.
   - Include clear explanations for the answers if possible.
   - The score field MUST be an integer between 1 and 10 (do NOT generate extremely large numbers).
4. **Schema Field Names:**
   - Use 'type' for the question type (allowed values: 'multiple_choice', 'true_false', 'matching', 'ordering'). Do NOT use 'question_type'.
   - Use 'question' for the question text. Do NOT use 'question_text'.
   - For 'multiple_choice': populate 'options' (array of strings) and 'correct_option_index' (integer, 0-indexed index of the correct option). Do NOT use 'correct_answer_ids'.
   - For 'true_false': populate 'correct_boolean' (boolean).
   - For 'matching': populate 'matching_pairs' (array of objects with 'left' and 'right' keys).
   - For 'ordering': populate 'ordering_items' (array of strings).
   - Do NOT include any 'id' fields.`;

const BaseGeneratedQuizSchema = z.object({
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

export const GeneratedQuizSchema = z
  .discriminatedUnion('type', [
    BaseGeneratedQuizSchema.extend({
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
        .describe('Index of the correct option for multiple choice.'),
    }),
    BaseGeneratedQuizSchema.extend({
      type: z.literal('true_false').describe('The question type.'),
      correct_boolean: z
        .boolean()
        .describe('Correct answer for true/false questions.'),
    }),
    BaseGeneratedQuizSchema.extend({
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
    BaseGeneratedQuizSchema.extend({
      type: z.literal('ordering').describe('The question type.'),
      ordering_items: z
        .array(z.string())
        .min(2)
        .describe('Items in their correct ordered sequence.'),
    }),
  ])
  .superRefine((quiz, ctx) => {
    if (
      quiz.type === 'multiple_choice' &&
      quiz.correct_option_index >= quiz.options.length
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['correct_option_index'],
        message: 'Correct option index must reference an existing option.',
      });
    }
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
