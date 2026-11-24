import { expect, run, test } from '../fixtures';
import { HOSTS, marker } from '../policy';
import {
  ABSENT,
  ANONYMOUS,
  anonymousStatus,
  ensureSeedClass,
  field,
  getJson,
  inviteAndAccept,
  type Json,
  list,
  REFUSED,
  refused,
  removeMember,
  renderPage,
  Resources,
  sendJson,
  suiteApi,
  suiteIdentities,
  suiteTrack,
  upskiiActors,
  withResources,
} from './upskii-helpers';

/**
 * Learner flows on app.upskii.com as the run's QA student. Setup (class,
 * membership, one published lesson and one class material) runs in hooks
 * with the teacher; the assessment and course-quiz attempt flows live in the
 * educator suite and are only listed here.
 */

test.describe.configure({ mode: 'serial', retries: 0, timeout: 120_000 });

const C = '/api/upskii';
const setup = new Resources(suiteTrack('learner'));
let classId = '';
let lessonId = '';
let materialId = '';

const NAV_PAGES = [
  '/',
  '/to-do',
  '/courses',
  '/files',
  '/grades',
  '/discover',
  '/tutor',
  '/flashcards',
  '/quiz',
];
const ACCOUNT_AND_TOOL_PAGES = [
  '/ai-tools',
  '/notifications',
  '/profile',
  '/settings',
];

// oxlint-disable-next-line no-empty-pattern -- Playwright requires a destructured fixtures argument
test.beforeAll(async ({}, info) => {
  info.setTimeout(120_000);
  const { teacher, student } = suiteIdentities();
  const track = suiteTrack('learner');
  const label = (what: string) => marker(run.runLabel, what);
  classId = await ensureSeedClass(teacher, track);
  const t = await suiteApi(teacher);
  await inviteAndAccept({
    teacherApi: t,
    studentApi: await suiteApi(student),
    classId,
    student,
    track,
    label,
  });

  const lesson = await setup.create(
    {
      what: 'learner-lesson',
      creator: 'teacher',
      api: t,
      id: (v: Json) => field(v, 'lesson.id'),
      cleanup: (id) => ({ method: 'DELETE', path: `${C}/lessons/${id}` }),
    },
    () =>
      sendJson(t, 'create lesson', 'POST', `${C}/lessons/manual`, {
        classId,
        title: label('learner lesson'),
        content: 'Water boils at 100 degrees Celsius at sea level.',
        kind: 'theory',
      })
  );
  lessonId = lesson.id;
  await sendJson(t, 'publish lesson', 'POST', `${C}/lessons/publish`, {
    lessonDraftId: lessonId,
  });

  const material = await setup.create(
    {
      what: 'learner-material',
      creator: 'teacher',
      api: t,
      id: (v: Json) => field(v, 'material.id'),
      cleanup: (fileId) => ({
        method: 'DELETE',
        path: `${C}/files`,
        body: { fileId, kind: 'material' },
      }),
    },
    () =>
      sendJson(t, 'upload material', 'POST', `${C}/materials/upload`, {
        classId,
        title: label('learner material'),
        sourceName: 'qa-e2e-learner.txt',
        contentText: 'Evaporation and condensation drive the water cycle.',
      })
  );
  materialId = material.id;
});

test.afterAll(async () => {
  const failures = await setup.flush();
  if (classId) {
    const { teacher, student } = suiteIdentities();
    await removeMember(await suiteApi(teacher), classId, student.userId);
  }
  expect(failures, 'learner setup cleanup').toEqual([]);
});

test('courses list shows the joined class with its lesson and material', async ({
  actors,
  upskiiApi,
}) => {
  const s = await upskiiApi(upskiiActors(actors).student);
  const classes = await getJson(s, 'learner classes', `${C}/classes`);
  const enrolled = list<{ class?: Json }>(classes, 'enrolled');
  expect(enrolled.some((item) => item.class?.id === classId)).toBe(true);

  const detail = await getJson(s, 'course detail', `${C}/classes/${classId}`);
  expect(field(detail, 'detail.class.id')).toBe(classId);
  expect((detail.detail as Json).membershipStatus).toBe('active');
  expect(
    list<Json>(detail, 'detail.lessons').some((l) => l.id === lessonId)
  ).toBe(true);
  expect(
    list<Json>(detail, 'detail.materials').some((m) => m.id === materialId)
  ).toBe(true);
});

test('lesson view and progress', async ({ actors, upskiiApi, track }) => {
  const s = await upskiiApi(upskiiActors(actors).student);
  const view = await getJson(s, 'learner lesson', `${C}/lessons/${lessonId}`);
  expect(field(view, 'detail.lesson.id')).toBe(lessonId);
  const moduleId = field(list(view, 'detail.lesson.sections')[0], 'id');

  // Progress has no DELETE; the student purge removes it.
  await withResources(track, async (res) => {
    const progress = await res.create(
      {
        what: 'lesson-progress',
        creator: 'student',
        api: s,
        id: () => `${lessonId}:${moduleId}`,
      },
      () =>
        sendJson(s, 'record progress', 'POST', `${C}/lessons/progress`, {
          lessonId,
          moduleId,
          completed: true,
        })
    );
    expect(list(progress.value, 'result.completedModuleIds')).toContain(
      moduleId
    );
  });
  const items = await getJson(s, 'progress list', `${C}/lessons/progress`);
  const item = list<Json>(items, 'items').find((i) => i.lessonId === lessonId);
  expect(Number(item?.completed ?? 0)).toBeGreaterThanOrEqual(1);
});

test('materials: personal list and the class material', async ({
  actors,
  upskiiApi,
}) => {
  const s = await upskiiApi(upskiiActors(actors).student);
  const personal = await getJson(s, 'personal materials', `${C}/materials`);
  expect(Array.isArray(personal.materials)).toBe(true);
  const material = await getJson(
    s,
    'class material',
    `${C}/materials/${materialId}`
  );
  expect(field(material, 'material.id')).toBe(materialId);
});

test('assessments and course quizzes list for the class', async ({
  actors,
  upskiiApi,
}) => {
  const s = await upskiiApi(upskiiActors(actors).student);
  const assessments = await getJson(
    s,
    'learner assessments',
    `${C}/assessments?classId=${classId}`
  );
  expect(Array.isArray(assessments.assessments)).toBe(true);
  const quizzes = await getJson(
    s,
    'learner quizzes',
    `${C}/course-quizzes?classId=${classId}`
  );
  expect(Array.isArray(quizzes.plans)).toBe(true);
});

test('flashcards: personal deck, card, review, delete', async ({
  actors,
  upskiiApi,
  track,
  label,
}) => {
  const s = await upskiiApi(upskiiActors(actors).student);
  await withResources(track, async (res) => {
    // The learn handler places decks in the learner's personal workspace.
    const deck = await res.create(
      {
        what: 'learner-deck',
        creator: 'student',
        api: s,
        id: (v: Json) => field(v, 'deck.id'),
        cleanup: (deckId) => ({
          method: 'DELETE',
          path: `${C}/flashcards`,
          body: { deckId },
        }),
      },
      () =>
        sendJson(s, 'create deck', 'POST', `${C}/flashcards`, {
          title: label('learner deck'),
          cards: [],
        })
    );
    const card = await res.create(
      {
        what: 'learner-card',
        creator: 'student',
        api: s,
        id: (v: Json) => field(v, 'card.id'),
      },
      () =>
        sendJson(s, 'create card', 'POST', `${C}/flashcards`, {
          action: 'create_card',
          deckId: deck.id,
          front: label('front'),
          back: 'Back',
        })
    );
    const decks = await getJson(s, 'learner flashcards', `${C}/flashcards`);
    expect(list<Json>(decks, 'decks').some((d) => d.id === deck.id)).toBe(true);
    const review = await sendJson(
      s,
      'review card',
      'POST',
      `${C}/flashcards/review`,
      {
        cardId: card.id,
        rating: 'again',
      }
    );
    expect(field(review, 'review.cardId')).toBe(card.id);
    expect((await deck.remove())?.ok).toBe(true);
  });
});

test('hub feed and notifications read', async ({
  actors,
  upskiiApi,
  track,
  label,
}) => {
  const { teacher, student } = upskiiActors(actors);
  const t = await upskiiApi(teacher);
  const s = await upskiiApi(student);
  const feed = await getJson(s, 'home feed', `${C}/home-feed`);
  expect(Array.isArray(feed.groups)).toBe(true);

  const title = label('learner announcement');
  await withResources(track, async (res) => {
    // No DELETE for announcements or deliveries; the owner purges remove them.
    await res.create(
      {
        what: 'learner-announcement',
        creator: 'teacher',
        api: t,
        id: (v: Json) => field(v, 'announcement.id'),
      },
      () =>
        sendJson(t, 'post announcement', 'POST', `${C}/announcements`, {
          classId,
          title,
          body: 'QA check.',
        })
    );
    let deliveryId = '';
    await expect
      .poll(
        async () => {
          const found = list<Json>(
            await getJson(s, 'notifications', `${C}/notifications`),
            'notifications'
          ).find(
            (n) =>
              String(n.title ?? '').includes(title) ||
              String(n.body ?? '').includes(title)
          );
          deliveryId = typeof found?.id === 'string' ? found.id : '';
          return deliveryId;
        },
        { timeout: 30_000, intervals: [2_000, 5_000] }
      )
      .not.toBe('');
    const read = await sendJson(
      s,
      'mark read',
      'POST',
      `${C}/notifications/read`,
      { deliveryId }
    );
    expect(field(read, 'read.deliveryId')).toBe(deliveryId);
    // Idempotent: marking again succeeds.
    await sendJson(s, 'mark read again', 'POST', `${C}/notifications/read`, {
      deliveryId,
    });
  });
});

test('grades for the class', async ({ actors, upskiiApi }) => {
  const s = await upskiiApi(upskiiActors(actors).student);
  const grades = await getJson(
    s,
    'learner grades',
    `${C}/grades?classId=${classId}`
  );
  expect('grades' in grades).toBe(true);
});

test('learner navigation pages render', async ({ actors, upskiiContext }) => {
  const context = await upskiiContext(upskiiActors(actors).student);
  for (const path of NAV_PAGES) {
    const page = await renderPage(context, 'upskiiApp', path);
    expect.soft(page.status, `${path} status`).toBeLessThan(400);
    expect
      .soft(page.origin, `${path} stays on the app host`)
      .toBe(HOSTS.upskiiApp);
    expect
      .soft(page.pathname, `${path} is not a sign-in page`)
      .not.toMatch(/^\/login/u);
    expect.soft(page.errorBoundary, `${path} error boundary`).toBe(false);
    expect.soft(page.textLength, `${path} has content`).toBeGreaterThan(20);
    expect.soft(page.serverErrors, `${path} network 5xx`).toEqual([]);
    expect.soft(page.paidAiCalls, `${path} paid AI calls`).toEqual([]);
  }
});

test('AI tools, notifications, profile and settings render without paid AI calls', async ({
  actors,
  upskiiContext,
}) => {
  const context = await upskiiContext(upskiiActors(actors).student);
  for (const path of ACCOUNT_AND_TOOL_PAGES) {
    const page = await renderPage(context, 'upskiiApp', path);
    expect.soft(page.status, `${path} status`).toBeLessThan(400);
    expect
      .soft(page.pathname, `${path} is not a sign-in page`)
      .not.toMatch(/^\/login/u);
    expect.soft(page.errorBoundary, `${path} error boundary`).toBe(false);
    expect.soft(page.textLength, `${path} has content`).toBeGreaterThan(20);
    expect.soft(page.serverErrors, `${path} network 5xx`).toEqual([]);
    expect.soft(page.paidAiCalls, `${path} paid AI calls`).toEqual([]);
  }
});

test('negatives: the teacher cannot call learner-only APIs', async ({
  actors,
  upskiiApi,
}) => {
  const t = await upskiiApi(upskiiActors(actors).teacher);
  const probes: [string, 'GET' | 'POST', string][] = [
    ['progress', 'POST', `${C}/lessons/progress`],
    ['notifications read', 'POST', `${C}/notifications/read`],
    ['grades', 'GET', `${C}/grades?classId=${classId}`],
    ['start attempt', 'POST', `${C}/assessment-attempts/start`],
    ['start quiz attempt', 'POST', `${C}/course-quiz-attempts/start`],
    ['submit attempt', 'POST', `${C}/assessment-attempts/submit`],
  ];
  for (const [what, method, path] of probes)
    await refused(t, `teacher ${what}`, method, path, ABSENT, { lessonId });
  const denied = await getJson(
    t,
    'teacher learn experience',
    `${C}/workspace-experience?experience=learn&path=%2F`,
    [403]
  );
  expect(denied.error).toBe('WORKSPACE_ROLE_REQUIRED');
});

test('negatives: the outsider sees nothing of the class', async ({
  actors,
  upskiiApi,
}) => {
  const o = await upskiiApi(upskiiActors(actors).outsider);
  const classes = await getJson(o, 'outsider classes', `${C}/classes`);
  expect(JSON.stringify(classes)).not.toContain(classId);
  const { json } = await o('outsider course', `${C}/classes/${classId}`, {
    expect: REFUSED,
  });
  expect((json as Json | null)?.detail).toBeUndefined();
  await refused(o, 'outsider lesson', 'GET', `${C}/lessons/${lessonId}`, [404]);
  await refused(
    o,
    'outsider material',
    'GET',
    `${C}/materials/${materialId}`,
    REFUSED
  );
  await refused(
    o,
    'outsider progress',
    'POST',
    `${C}/lessons/progress`,
    REFUSED,
    {
      lessonId,
      moduleId: 'none',
      completed: true,
    }
  );
  const decks = await getJson(o, 'outsider flashcards', `${C}/flashcards`);
  expect(JSON.stringify(decks)).not.toContain(classId);
});

test('negatives: anonymous visitors are sent to sign in', async ({
  anonymousContext,
}) => {
  const context = await anonymousContext();
  for (const path of ['/courses', '/grades']) {
    const page = await renderPage(context, 'upskiiApp', path);
    expect(page.pathname, `${path} redirects to sign in`).toMatch(/^\/login/u);
  }
  for (const path of [
    `${C}/classes`,
    `${C}/lessons/${lessonId}`,
    `${C}/notifications`,
  ])
    await anonymousStatus('upskiiApp', 'GET', path, ANONYMOUS);
});
