import 'server-only';

import { attachPrivateWorkspaceQuizAnswers } from '@tuturuuu/education-core/education/private-quiz-answers';
import {
  type ArenaBoardInput,
  type ArenaQuestionInput,
  arenaBoardInputSchema,
  arenaQuestionInputSchema,
  DEFAULT_ARENA_TIER_POINTS,
  MAX_ARENA_CATEGORIES,
  MAX_ARENA_TIERS,
} from '@tuturuuu/realtime/meet/room-quiz-arena';
import { createAdminClient } from '@tuturuuu/supabase/next/server';
import { getPermissions } from '@tuturuuu/utils/workspace-helper';
import {
  type getMeetCallAccess,
  MeetCallAccessError,
} from '../lib/call-access';

type Access = Awaited<ReturnType<typeof getMeetCallAccess>>;
type Db = Awaited<ReturnType<typeof courseAuthority>>;
type CourseOption = { id: string; name: string };
type CourseList = {
  courses: Array<CourseOption & { modules: CourseOption[] }>;
};

/**
 * Distributing lesson questions and answer keys needs the same course-editing
 * authority as Teach (`update_user_groups`), checked before any course read.
 * Only published, active, non-guest courses and published lessons are offered.
 */
async function courseAuthority(access: Access) {
  const denied = () =>
    new MeetCallAccessError(
      403,
      'Course editing access is required',
      'upskii_forbidden'
    );
  if (!access.canReadWorkspace) throw denied();
  const permissions = await getPermissions({
    wsId: access.meeting.ws_id,
    user: access.user,
  });
  if (!permissions || permissions.withoutPermission('update_user_groups'))
    throw denied();
  return createAdminClient({ noCookie: true });
}

export async function listUpskiiCourses(access: Access): Promise<CourseList> {
  const db = await courseAuthority(access);
  const { data: courses, error } = await db
    .from('workspace_user_groups')
    .select('id, name')
    .eq('ws_id', access.meeting.ws_id)
    .eq('is_course_published', true)
    .eq('archived', false)
    .eq('is_guest', false)
    .order('name')
    .limit(50);
  if (error) throw new MeetCallAccessError(503, 'Courses are unavailable');
  const publishedCourses: CourseOption[] = courses ?? [];
  const ids = publishedCourses.map(({ id }) => id);
  const moduleResult = ids.length
    ? await db
        .from('workspace_course_modules')
        .select('id, name, group_id')
        .in('group_id', ids)
        .eq('is_published', true)
        .order('sort_key')
        .limit(500)
    : null;
  if (moduleResult?.error)
    throw new MeetCallAccessError(503, 'Courses are unavailable');
  const modules: Array<CourseOption & { group_id: string }> =
    moduleResult?.data ?? [];
  return {
    courses: publishedCourses
      .map((course) => ({
        id: course.id,
        name: course.name,
        modules: modules
          .filter(({ group_id }) => group_id === course.id)
          .map(({ id, name }) => ({ id, name })),
      }))
      .filter(({ modules: list }) => list.length > 0),
  };
}

const unique = (labels: string[]) => {
  const seen = new Set<string>();
  return labels.filter((label) => {
    const key = label.normalize('NFKC').trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

type QuizRow = {
  id: string;
  question: string;
  type?: string | null;
  content?: unknown;
  answer?: unknown;
};
type OptionRow = {
  quiz_id: string;
  value: string;
  is_correct: boolean;
  explanation: string | null;
};

export function questionFromQuiz(
  quiz: QuizRow,
  options: OptionRow[]
): ArenaQuestionInput | null {
  const correct = options.find(({ is_correct }) => is_correct);
  if (!correct) return null;
  const others = unique(
    options
      .filter((o) => o !== correct)
      .map(({ value }) => value.trim().slice(0, 120))
  );
  const labels = unique([correct.value.trim().slice(0, 120), ...others]).slice(
    0,
    4
  );
  // Rotate so the correct answer is not always first.
  const shift = quiz.id.charCodeAt(0) % labels.length;
  const rotated = [...labels.slice(shift), ...labels.slice(0, shift)];
  const parsed = arenaQuestionInputSchema.safeParse({
    type: 'single_choice',
    question: quiz.question.trim().slice(0, 240),
    options: rotated,
    correctIndex: rotated.indexOf(labels[0] ?? ''),
    ...(correct.explanation
      ? { explanation: correct.explanation.slice(0, 500) }
      : {}),
  });
  return parsed.success ? parsed.data : null;
}

/** Short answers a lesson quiz stores for its own grading, when it has any. */
function storedAnswers(answer: unknown): string[] {
  const values = Array.isArray(answer)
    ? answer
    : typeof answer === 'string'
      ? [answer]
      : answer && typeof answer === 'object'
        ? [
            ...(Array.isArray((answer as { answers?: unknown }).answers)
              ? ((answer as { answers: unknown[] }).answers ?? [])
              : []),
            (answer as { text?: unknown }).text,
          ]
        : [];
  const accepted = values
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value.length <= 120);
  return unique(accepted).slice(0, 5);
}

const record = (value: unknown) =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;

/**
 * A lesson quiz kept in Teach's own shape: multiple choice stores its options
 * in `content` and the correct index in the private answer key, and a short
 * answer quiz becomes an open question whose stored short answers are the
 * accepted answers. Matching, ordering and true/false have no Quiz Arena
 * form, so they are left out.
 */
export function questionFromStoredQuiz(
  quiz: QuizRow
): ArenaQuestionInput | null {
  const content = record(quiz.content);
  const answer = record(quiz.answer);
  if (quiz.type === 'multiple_choice') {
    const options = Array.isArray(content?.options) ? content.options : [];
    const correctIndex = answer?.correctIndex;
    if (
      typeof correctIndex !== 'number' ||
      typeof options[correctIndex] !== 'string'
    )
      return null;
    return questionFromQuiz(
      quiz,
      options.flatMap((value, index) =>
        typeof value === 'string'
          ? [
              {
                quiz_id: quiz.id,
                value,
                is_correct: index === correctIndex,
                explanation: null,
              },
            ]
          : []
      )
    );
  }
  const shortAnswer =
    quiz.type === 'paragraph' ||
    ((quiz.type === null || quiz.type === undefined) &&
      !Array.isArray(content?.options));
  if (!shortAnswer) return null;
  const parsed = arenaQuestionInputSchema.safeParse({
    type: 'open_text',
    question: quiz.question.trim().slice(0, 240),
    acceptedAnswers: storedAnswers(quiz.answer),
  });
  return parsed.success ? parsed.data : null;
}

export function questionFromFlashcard(card: { front: string; back: string }) {
  const parsed = arenaQuestionInputSchema.safeParse({
    type: 'open_text',
    question: card.front.trim().slice(0, 240),
    acceptedAnswers: card.back.trim().length <= 120 ? [card.back.trim()] : [],
    explanation: card.back.trim().slice(0, 500),
  });
  return parsed.success ? parsed.data : null;
}

async function moduleQuestions(db: Db, wsId: string, moduleIds: string[]) {
  const [quizLinks, cardLinks] = await Promise.all([
    db
      .from('course_module_quizzes')
      .select('module_id, quiz_id')
      .in('module_id', moduleIds)
      .limit(600),
    db
      .from('course_module_flashcards')
      .select('module_id, flashcard_id')
      .in('module_id', moduleIds)
      .limit(600),
  ]);
  if (quizLinks.error || cardLinks.error)
    throw new MeetCallAccessError(503, 'Lesson content is unavailable');
  const quizIds = (quizLinks.data ?? []).map(({ quiz_id }) => quiz_id);
  const cardIds = (cardLinks.data ?? []).map(
    ({ flashcard_id }) => flashcard_id
  );
  const [quizzes, options, cards] = await Promise.all([
    quizIds.length
      ? db
          .from('workspace_quizzes')
          .select('id, question, type, content, answer')
          .in('id', quizIds)
          .eq('ws_id', wsId)
      : null,
    quizIds.length
      ? db
          .from('quiz_options')
          .select('quiz_id, value, is_correct, explanation')
          .in('quiz_id', quizIds)
      : null,
    cardIds.length
      ? db
          .from('workspace_flashcards')
          .select('id, front, back')
          .in('id', cardIds)
          .eq('ws_id', wsId)
      : null,
  ]);
  if (quizzes?.error || options?.error || cards?.error)
    throw new MeetCallAccessError(503, 'Lesson content is unavailable');
  // Teach keeps answer keys in the private schema; the legacy column is a fallback.
  const quizRows = await attachPrivateWorkspaceQuizAnswers(
    db,
    quizzes?.data ?? []
  ).catch((error: unknown) => {
    console.error('Lesson answer keys are unavailable', error);
    throw new MeetCallAccessError(503, 'Lesson content is unavailable');
  });
  const optionRows = options?.data ?? [];
  const cardRows = cards?.data ?? [];
  const byModule = new Map<string, ArenaQuestionInput[]>();
  let skipped = 0;
  const push = (moduleId: string, question: ArenaQuestionInput | null) => {
    if (!question) {
      skipped += 1;
      return;
    }
    byModule.set(moduleId, [...(byModule.get(moduleId) ?? []), question]);
  };
  for (const link of quizLinks.data ?? []) {
    const quiz = quizRows.find(({ id }) => id === link.quiz_id);
    if (!quiz) continue;
    const quizOptions = optionRows.filter(({ quiz_id }) => quiz_id === quiz.id);
    push(
      link.module_id,
      quizOptions.length > 0
        ? questionFromQuiz(quiz, quizOptions)
        : questionFromStoredQuiz(quiz)
    );
  }
  for (const link of cardLinks.data ?? []) {
    const card = cardRows.find(({ id }) => id === link.flashcard_id);
    if (card) push(link.module_id, questionFromFlashcard(card));
  }
  return { byModule, skipped };
}

/** Splits lesson questions into categories × difficulty tiers in lesson order. */
export function boardFromLessons(
  title: string,
  sections: Array<{ name: string; questions: ArenaQuestionInput[] }>,
  options: { bonusTiles: boolean; includeFinalRound: boolean } = {
    bonusTiles: false,
    includeFinalRound: false,
  }
): ArenaBoardInput | null {
  // The last lesson question becomes the final round when there is enough content.
  const total = sections.reduce(
    (sum, { questions }) => sum + questions.length,
    0
  );
  const last = [...sections]
    .reverse()
    .find(({ questions }) => questions.length > 0);
  const finalQuestion =
    options.includeFinalRound && total >= 4 && last
      ? { category: last.name.slice(0, 60), question: last.questions.at(-1) }
      : undefined;
  const playable =
    finalQuestion && last
      ? sections.map((section) =>
          section === last
            ? { ...section, questions: section.questions.slice(0, -1) }
            : section
        )
      : sections;
  const chunks = playable
    .flatMap(({ name, questions }) => {
      const parts = Math.ceil(questions.length / MAX_ARENA_TIERS);
      return Array.from({ length: parts }, (_, i) => ({
        name: (parts > 1 ? `${name} ${i + 1}` : name).slice(0, 60),
        questions: questions.slice(
          i * MAX_ARENA_TIERS,
          (i + 1) * MAX_ARENA_TIERS
        ),
      }));
    })
    .slice(0, MAX_ARENA_CATEGORIES);
  if (!chunks.length) return null;
  const tiers = Math.max(...chunks.map(({ questions }) => questions.length));
  const board = arenaBoardInputSchema.safeParse({
    title: title.slice(0, 120),
    source: 'upskii',
    categories: chunks.map(({ name }) => name),
    tierPoints: DEFAULT_ARENA_TIER_POINTS.slice(0, tiers),
    tiles: chunks.flatMap(({ questions }, categoryIndex) =>
      questions.map((question, tierIndex) => ({
        categoryIndex,
        tierIndex,
        question,
        isBonusWager:
          options.bonusTiles &&
          categoryIndex === chunks.length - 1 &&
          tierIndex === questions.length - 1 &&
          tierIndex >= 1,
      }))
    ),
    ...(finalQuestion ? { finalRound: finalQuestion } : {}),
  });
  return board.success ? board.data : null;
}

export async function buildUpskiiBoard(
  access: Access,
  input: {
    courseId: string;
    moduleId?: string;
    bonusTiles: boolean;
    includeFinalRound: boolean;
  }
) {
  const db = await courseAuthority(access);
  const { data: course } = await db
    .from('workspace_user_groups')
    .select('id, name, ws_id, is_course_published, archived, is_guest')
    .eq('id', input.courseId)
    .maybeSingle();
  if (
    !course ||
    course.ws_id !== access.meeting.ws_id ||
    !course.is_course_published ||
    course.archived ||
    course.is_guest
  )
    throw new MeetCallAccessError(404, 'Course not found', 'upskii_not_found');
  let query = db
    .from('workspace_course_modules')
    .select('id, name')
    .eq('group_id', course.id)
    .eq('is_published', true)
    .order('sort_key')
    .limit(MAX_ARENA_CATEGORIES * 4);
  if (input.moduleId) query = query.eq('id', input.moduleId);
  const { data: modules, error } = await query;
  if (error)
    throw new MeetCallAccessError(503, 'Lesson content is unavailable');
  if (!modules?.length)
    throw new MeetCallAccessError(404, 'Module not found', 'upskii_not_found');
  const { byModule, skipped } = await moduleQuestions(
    db,
    access.meeting.ws_id,
    modules.map(({ id }) => id)
  );
  const board = boardFromLessons(
    input.moduleId ? `${course.name} · ${modules[0]?.name ?? ''}` : course.name,
    modules.map(({ id, name }) => ({
      name,
      questions: byModule.get(id) ?? [],
    })),
    input
  );
  if (!board)
    throw new MeetCallAccessError(
      404,
      'This lesson has no quiz questions',
      'upskii_empty'
    );
  return { board, skipped };
}
