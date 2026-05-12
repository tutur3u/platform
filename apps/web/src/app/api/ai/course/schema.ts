import { z } from 'zod';

// ─── System Prompt ───────────────────────────────────────────────────────────

export const COURSE_GENERATION_PROMPT = `You are an expert Academic Curriculum Designer and Subject Matter Expert. Your goal is to transform raw document text into a high-quality, structured learning experience.

### GUIDELINES:
1. **Logical Progression:** Organize modules so that prerequisite knowledge is covered first.
2. **Information Synthesis:** Do not simply summarize; identify the core "learning pillars" within the document.
3. **Clarity:** Lesson titles should be action-oriented and clear.
4. **Noise Reduction:** Ignore document artifacts like page numbers, headers, footers, and bibliographies.
5. **Pedagogy:** Ensure each module has a clear learning objective that explains what the student will be able to DO after finishing it.

### FORMATTING:
- Output must be strictly valid JSON.
- Do not include conversational filler (e.g., "Here is your course...").
- Ensure the difficulty level is consistent throughout the course.`;

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

/**
 * Schema aligned with the DB structure:
 * - workspace_course_modules: name, content (TipTap JSON), extra_content (JSON), youtube_links
 * - workspace_quizzes: question, score
 * - quiz_options: value, is_correct, explanation
 * - workspace_flashcards: front, back
 */

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

export const FlashcardSchema = z.object({
  front: z.string().describe('The question or prompt side of the flashcard.'),
  back: z.string().describe('The answer or explanation side of the flashcard.'),
});

export const ModuleSchema = z.object({
  name: z
    .string()
    .describe(
      'Action-oriented module title describing what the learner will achieve (e.g., "Understand the Basics of Neural Networks").'
    ),
  content: z
    .string()
    .describe(
      'The detailed learning content formatted as markdown. The server converts this to TipTap JSON before storing it.'
    ),
  extra_content: z
    .string()
    .describe(
      'Key takeaways, glossary terms, or supplementary notes for this module.'
    )
    .nullable()
    .optional(),
  youtube_links: z
    .array(z.string().url())
    .describe('Relevant YouTube video URLs that support this module content.')
    .optional(),
  quizzes: z
    .array(QuizSchema)
    .describe(
      'Quiz questions to test comprehension of this module. Include 2-5 questions per module.'
    )
    .optional(),
  flashcards: z
    .array(FlashcardSchema)
    .describe(
      'Flashcards for key terms and concepts from this module. Include 3-8 per module.'
    )
    .optional(),
});

export const CourseGenerationSchema = z.object({
  modules: z
    .array(ModuleSchema)
    .min(1)
    .describe(
      'A list of course modules extracted from the document, ordered by logical progression. Large documents should yield multiple focused modules.'
    ),
});

// ─── Request Schema ──────────────────────────────────────────────────────────

export const GenerateCourseRequestSchema = z.object({
  fileName: z.string().max(255).optional(),
  groupId: z.uuid(),
  maxCharacters: z.number().int().positive().max(1_000_000).optional(),
  storagePath: z.string().min(1).max(1024),
  wsId: z.string().min(1),
});
