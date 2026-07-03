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
   - Use 'type' for the question type (allowed values: 'multiple_choice', 'true_false', 'matching', 'ordering', 'paragraph'). Do NOT use 'question_type'.
   - Use 'question' for the question text. Do NOT use 'question_text'.
   - For 'multiple_choice': populate 'options' (array of strings) and 'correct_option_index' (integer, 0-indexed index of the correct option). Do NOT use 'correct_answer_ids'.
   - For 'true_false': populate 'correct_boolean' (boolean).
   - For 'matching': populate 'matching_pairs' (array of actual objects with 'left' and 'right' keys, e.g., [{"left": "A", "right": "B"}]. Do NOT output stringified JSON strings like "{\\"left\\": \\"A\\", \\"right\\": \\"B\\"}").
   - For 'ordering': populate 'ordering_items' (array of strings).
   - For 'paragraph': do NOT populate options, matching_pairs, ordering_items, or correct answers (students will answer in text).
   - Do NOT include any 'id' fields.
5. **Handling Unused Fields:**
   - Fields that are not applicable to the generated question type MUST be set to null.
   - For example:
     - For 'multiple_choice': 'options' and 'correct_option_index' must be populated. 'correct_boolean', 'matching_pairs', and 'ordering_items' must be null.
     - For 'true_false': 'correct_boolean' must be populated. 'options', 'correct_option_index', 'matching_pairs', and 'ordering_items' must be null.
     - For 'matching': 'matching_pairs' must be populated. 'options', 'correct_option_index', 'correct_boolean', and 'ordering_items' must be null.
     - For 'ordering': 'ordering_items' must be populated. 'options', 'correct_option_index', 'correct_boolean', and 'matching_pairs' must be null.
     - For 'paragraph': 'options', 'correct_option_index', 'correct_boolean', 'matching_pairs', and 'ordering_items' must all be null.`;

export const GeneratedQuizSchema = z
  .object({
    type: z
      .enum([
        'multiple_choice',
        'true_false',
        'matching',
        'ordering',
        'paragraph',
      ])
      .describe('The question type.'),
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
    options: z
      .array(z.string())
      .min(2)
      .max(6)
      .nullable()
      .describe(
        'List of options for multiple choice questions. Set to null for other question types.'
      ),
    correct_option_index: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .describe(
        'Index of the correct option for multiple choice. Set to null for other question types.'
      ),
    correct_boolean: z
      .boolean()
      .nullable()
      .describe(
        'Correct answer for true/false questions. Set to null for other question types.'
      ),
    matching_pairs: z
      .array(
        z.object({
          left: z.string().describe('Left item to match'),
          right: z.string().describe('Right matched item'),
        })
      )
      .min(1)
      .nullable()
      .describe(
        'Pairs of items that match each other. Each pair must be a raw JSON object, NOT a stringified JSON string. Set to null for other question types.'
      ),
    ordering_items: z
      .array(z.string())
      .min(2)
      .nullable()
      .describe(
        'Items in their correct ordered sequence. Set to null for other question types.'
      ),
  })
  .superRefine((quiz, ctx) => {
    const requireNull = (
      field:
        | 'correct_boolean'
        | 'correct_option_index'
        | 'matching_pairs'
        | 'options'
        | 'ordering_items'
    ) => {
      if (quiz[field] !== null) {
        ctx.addIssue({
          code: 'custom',
          path: [field],
          message: `${field} must be null for ${quiz.type} questions.`,
        });
      }
    };

    if (quiz.type === 'multiple_choice') {
      if (!quiz.options || quiz.options.length < 2) {
        ctx.addIssue({
          code: 'custom',
          path: ['options'],
          message: 'Multiple choice questions require at least 2 options.',
        });
      }
      if (
        quiz.correct_option_index === null ||
        quiz.correct_option_index === undefined
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['correct_option_index'],
          message: 'Multiple choice questions require correct_option_index.',
        });
      } else if (
        quiz.options &&
        quiz.correct_option_index >= quiz.options.length
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['correct_option_index'],
          message: 'Correct option index must reference an existing option.',
        });
      }
      requireNull('correct_boolean');
      requireNull('matching_pairs');
      requireNull('ordering_items');
    } else if (quiz.type === 'true_false') {
      if (quiz.correct_boolean === null || quiz.correct_boolean === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['correct_boolean'],
          message: 'True/false questions require correct_boolean.',
        });
      }
      requireNull('correct_option_index');
      requireNull('matching_pairs');
      requireNull('options');
      requireNull('ordering_items');
    } else if (quiz.type === 'matching') {
      if (!quiz.matching_pairs || quiz.matching_pairs.length < 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['matching_pairs'],
          message: 'Matching questions require at least 1 matching pair.',
        });
      }
      requireNull('correct_boolean');
      requireNull('correct_option_index');
      requireNull('options');
      requireNull('ordering_items');
    } else if (quiz.type === 'ordering') {
      if (!quiz.ordering_items || quiz.ordering_items.length < 2) {
        ctx.addIssue({
          code: 'custom',
          path: ['ordering_items'],
          message: 'Ordering questions require at least 2 ordering items.',
        });
      }
      requireNull('correct_boolean');
      requireNull('correct_option_index');
      requireNull('matching_pairs');
      requireNull('options');
    } else if (quiz.type === 'paragraph') {
      requireNull('correct_boolean');
      requireNull('correct_option_index');
      requireNull('matching_pairs');
      requireNull('options');
      requireNull('ordering_items');
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
  testId: z.string().uuid().optional(),
  wsId: z.string().min(1),
  context: z.string().max(4000).optional(),
  questionType: z
    .enum([
      'multiple_choice',
      'true_false',
      'matching',
      'ordering',
      'paragraph',
      'mix',
    ])
    .default('mix'),
  count: z.number().int().min(1).max(50).default(5),
});
