import { z } from 'zod';

// ─── System Prompt ───────────────────────────────────────────────────────────

// (Single, authoritative COURSE_GENERATION_PROMPT defined below)
export const COURSE_GENERATION_PROMPT = `You are an expert Academic Curriculum Designer and Subject Matter Expert. Your goal is to transform raw document text into a high-quality, structured, and specific learning experience.

### GUIDELINES FOR DEPTH & SPECIFICITY:
1. **Rigor and Fact-Driven Content:** Do NOT write generic summaries, high-level outlines, or general filler. If the input document contains code snippets, logic formulas, specific rules (e.g., 'ACE' sibling discount at 5%, 'GT' referral discount at 5%), steps, or constraints, you MUST explicitly incorporate, define, and detail them in the content. Explain concepts fully, but concisely.
2. **Pedagogy:** Ensure each module has a clear learning objective that explains what the student will be able to DO after finishing it.
3. **Information Synthesis:** Do not simply summarize; identify the core "learning pillars" within the document.
4. **Specific but Concise (Avoid Timeouts):** To prevent request timeout issues, write directly and concisely. Avoid generic introductory and concluding sentences (e.g. "Managing X is important because..."). Start explaining concrete facts, formulas, rules, and steps immediately. Write 1-3 highly detailed paragraphs per section (approx. 150-350 words total per section).
5. **Noise Reduction:** Ignore document artifacts like page numbers, headers, footers, and bibliographies.

### MULTI-SECTION STRUCTURE:
- **You MUST use the \`sections\` array field** to structure each module. Do not output the single \`content\` field at the module level.
- Each module **MUST** contain 2 to 4 logical sections representing the curriculum (for example: Overview & Core Objectives, Core Concepts & Explanations, Step-by-Step implementation).
- Each section's content must be detailed, comprehensive, and specific, yet concise. Write 1-3 long paragraphs per section. Make extensive use of markdown formatting within each section's content: bolding for key terms, lists (ordered/unordered) for processes, code blocks for code/configuration, and blockquotes for important rules/notes.

### FORMATTING:
- Output must be strictly valid JSON that conforms to the CourseGenerationSchema.
- Do not include conversational filler.
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

// TipTap/ProseMirror document shape (minimal validation)
export const TipTapDocSchema = z
  .object({
    type: z.literal('doc'),
    content: z.array(z.any()),
  })
  .describe(
    'TipTap/ProseMirror document object with `type: "doc"` and `content`.'
  );

export const SectionSchema = z.object({
  title: z
    .string()
    .describe(
      'The title of this specific section (e.g. "1. Overview & Objectives", "2. Core Principles", "3. Implementation Guide").'
    ),
  content: z
    .string()
    .describe(
      'Highly specific and fact-driven markdown content for this section. Write 1-3 focused paragraphs. Directly cover specific terms, formulas, rules, and code snippets from the document. Avoid generic filler.'
    ),
});

export const ModuleSchema = z.object({
  name: z
    .string()
    .describe(
      'Action-oriented module title describing what the learner will achieve (e.g., "Understand the Basics of Neural Networks").'
    ),
  sections: z
    .array(SectionSchema)
    .min(2)
    .max(4)
    .describe(
      "A list of 2 to 4 detailed, focused sections representing the module's curriculum. Every module MUST have multiple sections."
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

export const GenerateCourseRequestSchema = z
  .object({
    context: z.string().max(4_000).optional(),
    fileName: z.string().max(255).optional(),
    groupId: z.guid(),
    maxCharacters: z.number().int().positive().max(1_000_000).optional(),
    storagePath: z.string().min(1).max(1024).optional(),
    fileId: z.guid().optional(),
    wsId: z.string().min(1),
  })
  .refine((data) => data.storagePath || data.fileId, {
    message: 'Either storagePath or fileId must be provided',
    path: ['storagePath'],
  });
