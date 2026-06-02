import { z } from 'zod';

export const QUIZ_GENERATION_PROMPT = `You are an expert Academic Curriculum Designer and Subject Matter Expert. Your goal is to transform lesson content into a set of high-quality, structured, and specific quizzes.

### GUIDELINES FOR DEPTH & SPECIFICITY:
1. **Rigor and Fact-Driven Content:** Do NOT write generic questions or high-level definitions. If the lesson content contains code snippets, formulas, specific rules, steps, or constraints, incorporate them directly into the quiz questions and option explanations.
2. **Pedagogy:** Ensure each question tests a clear learning objective based on the lesson content.
3. **Format Options:**
   - Every quiz must have a clear question and a score (usually 1-10, default to 1).
   - Each quiz must have multiple options (between 2 and 6 options).
   - At least one option MUST be marked as correct.
   - For every option, provide a detailed and constructive explanation of why it is correct or incorrect.

### FORMATTING:
- Output must be strictly valid JSON that conforms to the QuizGenerationSchema.
- Do not include conversational filler.`;

export const QuizOptionSchema = z.object({
  value: z.string().describe('The text of this answer option.'),
  is_correct: z
    .boolean()
    .describe('Whether this option is the correct answer.'),
  explanation: z
    .string()
    .nullable()
    .describe('Brief explanation of why this option is correct or incorrect.')
    .optional(),
});

export const QuizSchema = z.object({
  question: z.string().describe('The quiz question text.'),
  score: z
    .number()
    .int()
    .positive()
    .describe('Point value for this question (typically 1-10).')
    .default(1),
  quiz_options: z
    .array(QuizOptionSchema)
    .min(2)
    .max(6)
    .describe(
      'Answer options for this quiz question. At least one must be correct.'
    )
    .refine((options) => options.some((option) => option.is_correct), {
      error: 'At least one quiz option must be marked as correct.',
    }),
});

export const QuizGenerationSchema = z.object({
  quizzes: z
    .array(QuizSchema)
    .min(1)
    .describe('A list of quizzes generated based on the lesson content.'),
});

export const GenerateQuizRequestSchema = z.object({
  lessonId: z.string().uuid(),
  wsId: z.string().min(1),
  context: z.string().max(4000).optional(),
});
