import { expect } from '../fixtures';
import type { Actors } from '../actors';
import type { UpskiiApp, UpskiiIdentity } from '../upskii';
import {
  field,
  getJson,
  type Json,
  list,
  REFUSED,
  refused,
  sendJson,
  upskiiActors,
  withResources,
} from './upskii-helpers';

/**
 * Assessment and course-quiz flows for the educator suite, kept beside it
 * so the suite file stays within the source-size ceiling.
 */

export const C = '/api/upskii';

/** Product cleanup spec: DELETE `path`, with an optional body built from the id. */
export const del =
  (path: string, body?: (id: string) => Record<string, unknown>) =>
  (id: string) => ({
    method: 'DELETE' as const,
    path,
    ...(body ? { body: body(id) } : {}),
  });
export const named = (title: string) => (n: Json) =>
  String(n.title ?? '').includes(title) || String(n.body ?? '').includes(title);

export interface Flow {
  actors: Actors;
  upskiiApi: (identity: UpskiiIdentity) => Promise<UpskiiApp>;
  track: Parameters<typeof withResources>[0];
  label: (what: string) => string;
}

export async function assessmentFlow(
  { actors, upskiiApi, track, label }: Flow,
  classId: string
) {
  const { teacher, student } = upskiiActors(actors);
  const t = await upskiiApi(teacher);
  const s = await upskiiApi(student);
  await withResources(track, async (res) => {
    // Multiple choice scores deterministically; written answers and
    // assessments/grade call a paid model.
    const assessment = await res.create(
      {
        what: 'assessment',
        creator: 'teacher',
        api: t,
        id: (v: Json) => field(v, 'assessment.id'),
        cleanup: del(`${C}/assessments`, (assessmentId) => ({ assessmentId })),
      },
      () =>
        sendJson(t, 'create assessment', 'POST', `${C}/assessments`, {
          classId,
          title: label('assessment'),
          feedbackMode: 'after_submit',
          timeLimitMinutes: null,
          deadlineAt: null,
          attemptLimit: null,
          questions: [
            {
              mode: 'multiple_choice',
              prompt: '2 + 2 = ?',
              choices: ['3', '4'],
              answer: '4',
              points: 2,
            },
          ],
        })
    );
    const A = assessment.id;
    await sendJson(
      t,
      'publish assessment',
      'POST',
      `${C}/assessments/${A}/publish`,
      {}
    );
    await sendJson(t, 'assign assessment', 'POST', `${C}/assessments/assign`, {
      assessmentId: A,
      timeLimitMinutes: null,
    });

    const listed = await getJson(
      s,
      'learner assessments',
      `${C}/assessments?classId=${classId}`
    );
    expect(JSON.stringify(list(listed, 'assessments'))).toContain(A);
    const view = await getJson(
      s,
      'learner assessment',
      `${C}/assessments/${A}`
    );
    const questionId = field(list(view, 'questions')[0], 'id');

    // Attempts are hard-deleted with the assessment; the student purge backs it.
    const attempt = await res.create(
      {
        what: 'assessment-attempt',
        creator: 'student',
        api: s,
        id: (v: Json) => field(v, 'attempt.id'),
      },
      () =>
        sendJson(s, 'start attempt', 'POST', `${C}/assessment-attempts/start`, {
          assessmentId: A,
        })
    );
    const attemptId = attempt.id;
    await sendJson(s, 'answer', 'POST', `${C}/assessment-attempts/answers`, {
      attemptId,
      questionId,
      selectedChoice: '4',
    });
    const submitted = await sendJson(
      s,
      'submit',
      'POST',
      `${C}/assessment-attempts/submit`,
      { attemptId }
    );
    expect(field(submitted, 'attempt.id')).toBe(attemptId);

    const reviewPath = `${C}/assessment-attempts/${attemptId}/review`;
    const answerId = field(
      list(await getJson(t, 'review attempt', reviewPath), 'answers')[0],
      'id'
    );
    const graded = await sendJson(t, 'grade attempt', 'PATCH', reviewPath, {
      status: 'reviewed',
      teacherFeedback: label('review'),
      answerOverrides: [{ answerId, teacherScore: 1.5 }],
    });
    expect((graded.attempt as Json).finalScore).toBe(1.5);

    // The review precedes the first gradebook read so the sync picks it up.
    const book = await getJson(
      t,
      'gradebook',
      `${C}/gradebook?classId=${classId}`
    );
    const column = list<Json>(book, 'gradebook.columns').find(
      (c) => c.sourceId === A
    );
    const columnId = field(column, 'id');
    const entry = list<Json>(book, 'gradebook.entries').find(
      (e) =>
        e.sourceAttemptId === attemptId ||
        (e.columnId === columnId && e.studentId === student.userId)
    );
    expect(entry?.score).toBe(1.5);
    await sendJson(t, 'release column', 'POST', `${C}/gradebook`, {
      action: 'release-column',
      classId,
      columnId,
    });
    const grades = await getJson(
      s,
      'learner grades',
      `${C}/grades?classId=${classId}`
    );
    expect(JSON.stringify(grades.grades)).toContain(columnId);

    expect((await assessment.remove())?.deleted).toBe(true);
    await refused(
      s,
      'deleted assessment',
      'GET',
      `${C}/assessments/${A}`,
      REFUSED
    );
  });
}

export async function courseQuizFlow(
  { actors, upskiiApi, track, label }: Flow,
  classId: string
) {
  const { teacher, student } = upskiiActors(actors);
  const t = await upskiiApi(teacher);
  const s = await upskiiApi(student);
  await withResources(track, async (res) => {
    const quiz = await res.create(
      {
        what: 'course-quiz',
        creator: 'teacher',
        api: t,
        id: (v: Json) => field(v, 'plan.id'),
        cleanup: del(`${C}/course-quizzes`, (planId) => ({ planId })),
      },
      () =>
        sendJson(t, 'create quiz', 'POST', `${C}/course-quizzes`, {
          classId,
          title: label('course quiz'),
          timeLimitMinutes: null,
          deadlineAt: null,
          questions: [
            {
              mode: 'multiple_choice',
              prompt: '3 + 3 = ?',
              choices: ['6', '7'],
              answer: '6',
              points: 1,
            },
          ],
        })
    );
    const planId = quiz.id;
    await sendJson(
      t,
      'publish quiz',
      'POST',
      `${C}/course-quizzes/${planId}/publish`,
      {}
    );
    const plans = await getJson(
      s,
      'learner quizzes',
      `${C}/course-quizzes?classId=${classId}`
    );
    expect(JSON.stringify(list(plans, 'plans'))).toContain(planId);
    const view = await getJson(
      s,
      'learner quiz',
      `${C}/course-quizzes/${planId}`
    );
    const questionId = field(list(view, 'questions')[0], 'id');
    const attempt = await res.create(
      {
        what: 'quiz-attempt',
        creator: 'student',
        api: s,
        id: (v: Json) => field(v, 'attempt.id'),
      },
      () =>
        sendJson(s, 'start quiz', 'POST', `${C}/course-quiz-attempts/start`, {
          planId,
        })
    );
    const attemptId = attempt.id;
    await sendJson(
      s,
      'answer quiz',
      'POST',
      `${C}/course-quiz-attempts/answers`,
      { attemptId, questionId, selectedChoice: '6' }
    );
    const submitted = await sendJson(
      s,
      'submit quiz',
      'POST',
      `${C}/course-quiz-attempts/submit`,
      { attemptId }
    );
    expect(field(submitted, 'attempt.id')).toBe(attemptId);
    expect((await quiz.remove())?.deleted).toBe(true);
  });
}
