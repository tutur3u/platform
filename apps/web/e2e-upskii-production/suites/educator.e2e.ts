import { expect, test } from '../fixtures';
import {
  ABSENT,
  ANONYMOUS,
  anonymousStatus,
  ensureSeedClass,
  field,
  getJson,
  inviteAndAccept,
  isActiveMember,
  type Json,
  list,
  REFUSED,
  refused,
  removeMember,
  sendJson,
  suiteApi,
  suiteIdentities,
  suiteTrack,
  upskiiActors,
  withResources,
  WRONG_METHOD,
} from './upskii-helpers';
import {
  assessmentFlow,
  C,
  courseQuizFlow,
  del,
  named,
} from './educator-flows';

/**
 * Educator flows on app.upskii.com as the run's QA teacher, with the QA
 * student as the learner. The teacher's selected role routes /api/upskii/*
 * to the educator handlers; the student's to the learn handlers.
 */

test.describe.configure({ mode: 'serial', retries: 0, timeout: 120_000 });

let classId = '';

test.beforeAll(async () => {
  const { teacher } = suiteIdentities();
  classId = await ensureSeedClass(teacher, suiteTrack('educator'));
});

test.afterAll(async () => {
  if (!classId) return;
  const { teacher, student } = suiteIdentities();
  const api = await suiteApi(teacher);
  await removeMember(api, classId, student.userId);
  expect(await isActiveMember(api, classId, student.userId)).toBe(false);
});

test('experience admission: teacher is admitted to educator, student is not', async ({
  actors,
  upskiiApi,
}) => {
  const { teacher, student } = upskiiActors(actors);
  const path = `${C}/workspace-experience?experience=educator&path=%2F`;
  const admitted = await getJson(
    await upskiiApi(teacher),
    'teacher experience',
    path
  );
  expect(field(admitted, 'href')).toBe('/workspace/educator');
  const denied = await getJson(
    await upskiiApi(student),
    'student experience',
    path,
    [403]
  );
  expect(denied.error).toBe('WORKSPACE_ROLE_REQUIRED');
});

test('classes: read, rotate join code, invite and accept, roster', async ({
  actors,
  upskiiApi,
  track,
  label,
}) => {
  const { teacher, student } = upskiiActors(actors);
  const t = await upskiiApi(teacher);
  const s = await upskiiApi(student);

  const detail = await getJson(t, 'class detail', `${C}/classes/${classId}`);
  expect(field(detail, 'detail.class.id')).toBe(classId);
  const classes = await getJson(t, 'teacher classes', `${C}/classes`);
  expect(JSON.stringify(list(classes, 'classes'))).toContain(classId);
  await getJson(t, 'dashboard summary', `${C}/dashboard-summary`);

  // Class PATCH and class-settings PATCH both require Turnstile
  // (verifyCourseSave); the join-code rotation is the settings write here.
  const before = (detail.detail as { class: Json }).class.joinCode;
  const rotated = await sendJson(
    t,
    'rotate join code',
    'PATCH',
    `${C}/classes/join-code`,
    { classId }
  );
  expect(field(rotated, 'class.id')).toBe(classId);
  expect((rotated.class as Json).joinCode).not.toBe(before);

  // The membership stays for the rest of the suite; afterAll removes it.
  const joined = await inviteAndAccept({
    teacherApi: t,
    studentApi: s,
    classId,
    student,
    track,
    label,
  });
  expect(joined.seenByLearner).toBe(true);
  expect(await isActiveMember(t, classId, student.userId)).toBe(true);
  const learnerClasses = await getJson(s, 'learner classes', `${C}/classes`);
  expect(JSON.stringify(list(learnerClasses, 'enrolled'))).toContain(classId);
});

test('lessons: draft, add a module, publish, learner sees it, unpublish, archive', async ({
  actors,
  upskiiApi,
  track,
  label,
}) => {
  const { teacher, student, outsider } = upskiiActors(actors);
  const [t, s, o] = await Promise.all([
    upskiiApi(teacher),
    upskiiApi(student),
    upskiiApi(outsider),
  ]);
  await withResources(track, async (res) => {
    const lesson = await res.create(
      {
        what: 'lesson',
        creator: 'teacher',
        api: t,
        id: (v: Json) => field(v, 'lesson.id'),
        cleanup: (id) => del(`${C}/lessons/${id}`)(id),
      },
      () =>
        sendJson(t, 'create lesson', 'POST', `${C}/lessons/manual`, {
          classId,
          title: label('lesson'),
          content: 'Photosynthesis turns light into chemical energy.',
          kind: 'theory',
        })
    );
    const lessonDraftId = lesson.id;
    await sendJson(t, 'append module', 'PATCH', `${C}/lessons/manual`, {
      lessonDraftId,
      mode: 'append',
      kind: 'example',
      title: label('module'),
      content: 'A leaf in sunlight stores energy as glucose.',
    });
    const modules = await getJson(
      t,
      'lesson modules',
      `${C}/lessons/modules?lessonDraftId=${lessonDraftId}`
    );
    expect(list(modules, 'modules')).toHaveLength(2);

    await sendJson(t, 'publish lesson', 'POST', `${C}/lessons/publish`, {
      lessonDraftId,
    });
    const seen = await getJson(
      s,
      'learner lesson',
      `${C}/lessons/${lessonDraftId}`
    );
    expect(field(seen, 'detail.lesson.id')).toBe(lessonDraftId);
    expect(list(seen, 'detail.lesson.sections').length).toBeGreaterThan(0);
    await refused(
      o,
      'outsider lesson',
      'GET',
      `${C}/lessons/${lessonDraftId}`,
      [404]
    );

    await sendJson(t, 'unpublish lesson', 'POST', `${C}/lessons/unpublish`, {
      lessonDraftId,
    });
    await refused(
      s,
      'learner unpublished lesson',
      'GET',
      `${C}/lessons/${lessonDraftId}`,
      [404]
    );
    // DELETE /lessons/{id} archives the draft.
    const archived = await lesson.remove();
    expect((archived?.lesson as Json | undefined)?.status).toBe('archived');
  });
});

test('files: create a class folder, then delete it', async ({
  actors,
  upskiiApi,
  track,
  label,
}) => {
  const t = await upskiiApi(upskiiActors(actors).teacher);
  // Folder paths are capped at 48 characters; the marker prefix survives.
  const name = label('folder').slice(0, 48);
  await withResources(track, async (res) => {
    const folder = await res.create(
      {
        what: 'folder',
        creator: 'teacher',
        api: t,
        id: (v: Json) => field(v, 'folder.id'),
        cleanup: del(`${C}/files`, (folderId) => ({
          kind: 'folder',
          folderId,
          name,
          classId,
        })),
      },
      () =>
        sendJson(t, 'create folder', 'POST', `${C}/files`, { name, classId })
    );
    expect((folder.value.folder as Json).name).toBe(name);
    expect(field(await folder.remove(), 'folder.id')).toBe(folder.id);
  });
});

test('assessments: create, publish, assign, learner submits, teacher grades, gradebook', async ({
  actors,
  upskiiApi,
  track,
  label,
}) => {
  await assessmentFlow({ actors, upskiiApi, track, label }, classId);
});

test('course quiz: create, publish, learner attempt, delete', async ({
  actors,
  upskiiApi,
  track,
  label,
}) => {
  await courseQuizFlow({ actors, upskiiApi, track, label }, classId);
});

test('flashcards: class deck and card, review, delete', async ({
  actors,
  upskiiApi,
  track,
  label,
}) => {
  const t = await upskiiApi(upskiiActors(actors).teacher);
  await withResources(track, async (res) => {
    const deck = await res.create(
      {
        what: 'flashcard-deck',
        creator: 'teacher',
        api: t,
        id: (v: Json) => field(v, 'deck.id'),
        cleanup: del(`${C}/flashcards`, (deckId) => ({ deckId })),
      },
      () =>
        sendJson(t, 'create deck', 'POST', `${C}/flashcards`, {
          title: label('deck'),
          classId,
          cards: [],
        })
    );
    // Cards go with their deck.
    const card = await res.create(
      {
        what: 'flashcard',
        creator: 'teacher',
        api: t,
        id: (v: Json) => field(v, 'card.id'),
      },
      () =>
        sendJson(t, 'create card', 'POST', `${C}/flashcards`, {
          action: 'create_card',
          deckId: deck.id,
          front: label('front'),
          back: 'Back',
        })
    );
    const review = await sendJson(
      t,
      'review card',
      'POST',
      `${C}/flashcards/review`,
      { cardId: card.id, rating: 'known' }
    );
    expect(field(review, 'review.cardId')).toBe(card.id);
    expect((await deck.remove())?.ok).toBe(true);
  });
});

test('ai chat: one short prompt in a class conversation, then delete', async ({
  actors,
  upskiiApi,
  track,
  label,
}) => {
  const t = await upskiiApi(upskiiActors(actors).teacher);
  const scope = { classId, module: 'class' };
  await withResources(track, async (res) => {
    // ai-chat has no DELETE method; deletion is a POST action.
    const conversation = await res.create(
      {
        what: 'ai-conversation',
        creator: 'teacher',
        api: t,
        id: (v: Json) => field(v, 'conversation.id'),
        cleanup: (conversationId) => ({
          method: 'POST',
          path: `${C}/ai-chat`,
          body: { action: 'delete_conversation', conversationId, ...scope },
        }),
      },
      () =>
        sendJson(t, 'create conversation', 'POST', `${C}/ai-chat`, {
          action: 'create_conversation',
          title: label('ai chat'),
          ...scope,
        })
    );
    // The run's single platform-paid model call (Gemini, plain JSON reply).
    const reply = await sendJson(t, 'ai prompt', 'POST', `${C}/ai-chat`, {
      prompt: 'Reply with the single word OK.',
      conversationId: conversation.id,
      ...scope,
    });
    expect(reply.assistantMessage).toBeTruthy();
    expect(reply.userMessage).toBeTruthy();
    const after = await conversation.remove();
    expect(JSON.stringify(after?.conversations ?? [])).not.toContain(
      conversation.id
    );
  });
});

test('tutor: session on a class material, then completed', async ({
  actors,
  upskiiApi,
  track,
  label,
}) => {
  const t = await upskiiApi(upskiiActors(actors).teacher);
  await withResources(track, async (res) => {
    // A JSON text material: deterministic embeddings, no model call.
    const material = await res.create(
      {
        what: 'material',
        creator: 'teacher',
        api: t,
        id: (v: Json) => field(v, 'material.id'),
        cleanup: del(`${C}/files`, (fileId) => ({ fileId, kind: 'material' })),
      },
      () =>
        sendJson(t, 'upload material', 'POST', `${C}/materials/upload`, {
          classId,
          title: label('material'),
          sourceName: 'qa-e2e.txt',
          contentText:
            'Photosynthesis converts light energy into chemical energy in plants.',
        })
    );
    // Sessions have no DELETE: cleanup marks them completed (statuses are
    // active|paused|interrupted|completed) and deletes their conversation.
    const session = await res.create(
      {
        what: 'tutor-session',
        creator: 'teacher',
        api: t,
        id: (v: Json) => field(v, 'id'),
        cleanup: (id) => ({
          method: 'PATCH',
          path: `${C}/tutor/sessions/${id}`,
          body: { status: 'completed' },
        }),
      },
      () =>
        sendJson(t, 'start tutor session', 'POST', `${C}/tutor/sessions`, {
          resourceId: material.id,
          resourceKind: 'material',
          mode: 'live',
        })
    );
    const conversationId = field(session.value, 'conversationId');
    await res.create(
      {
        what: 'tutor-conversation',
        creator: 'teacher',
        api: t,
        id: () => conversationId,
        cleanup: () => ({
          method: 'POST',
          path: `${C}/ai-chat`,
          body: {
            action: 'delete_conversation',
            conversationId,
            classId: field(session.value, 'classId'),
            module: 'tutor',
          },
        }),
      },
      async () => session.value
    );
    expect(session.value.status).toBe('active');
    expect((await session.remove())?.status).toBe('completed');
  });
});

test('announcements reach the learner notifications', async ({
  actors,
  upskiiApi,
  track,
  label,
}) => {
  const { teacher, student } = upskiiActors(actors);
  const t = await upskiiApi(teacher);
  const s = await upskiiApi(student);
  const title = label('announcement');
  await withResources(track, async (res) => {
    // No DELETE API for announcements; the teacher purge removes it. Its
    // email delivery goes to the QA mailbox.
    await res.create(
      {
        what: 'announcement',
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
    const delivered = async () =>
      list<Json>(
        await getJson(s, 'learner notifications', `${C}/notifications`),
        'notifications'
      ).some(named(title));
    await expect
      .poll(delivered, { timeout: 30_000, intervals: [2_000, 5_000] })
      .toBe(true);
  });
});

test('settings: voice preference round trip', async ({ actors, upskiiApi }) => {
  const t = await upskiiApi(upskiiActors(actors).teacher);
  const path = `${C}/settings/voice`;
  const { status, json } = await t('voice settings', path, {
    expect: [200, 404],
  });
  test.skip(
    status === 404,
    'Voice settings are behind UPSKII_SETTINGS_VOICE_ENABLED, which is off'
  );
  const snapshot = json as { preferences: Json | null; defaults: Json };
  const current = snapshot.preferences ?? snapshot.defaults;
  const pace = current.pace === 'slow' ? 'normal' : 'slow';
  try {
    const saved = await sendJson(t, 'save voice', 'PATCH', path, {
      ...current,
      pace,
    });
    expect((saved.preferences as Json).pace).toBe(pace);
  } finally {
    await sendJson(
      t,
      'restore voice',
      'PATCH',
      path,
      snapshot.preferences ?? { reset: true }
    );
  }
  expect((await getJson(t, 'voice settings', path)).preferences).toEqual(
    snapshot.preferences
  );
});

test('negatives: the student cannot call educator APIs', async ({
  actors,
  upskiiApi,
}) => {
  const s = await upskiiApi(upskiiActors(actors).student);
  const probes: [
    string,
    'GET' | 'POST' | 'PATCH' | 'DELETE',
    string,
    number[],
  ][] = [
    ['announce', 'POST', `${C}/announcements`, ABSENT],
    ['gradebook', 'GET', `${C}/gradebook?classId=${classId}`, ABSENT],
    ['publish lesson', 'POST', `${C}/lessons/publish`, ABSENT],
    ['join code', 'PATCH', `${C}/classes/join-code`, ABSENT],
    ['remove member', 'DELETE', `${C}/memberships`, ABSENT],
    ['dashboard', 'GET', `${C}/dashboard-summary`, ABSENT],
    [
      'assessment authoring',
      'GET',
      `${C}/assessments/${classId}/authoring`,
      ABSENT,
    ],
    // These paths also match a learn GET pattern, so the method is refused.
    ['delete assessment', 'DELETE', `${C}/assessments`, WRONG_METHOD],
    ['create quiz', 'POST', `${C}/course-quizzes`, WRONG_METHOD],
    ['assign', 'POST', `${C}/assessments/assign`, WRONG_METHOD],
  ];
  for (const [what, method, path, statuses] of probes)
    await refused(s, `student ${what}`, method, path, statuses, { classId });
});

test('negatives: the outsider sees nothing of the class', async ({
  actors,
  upskiiApi,
}) => {
  const o = await upskiiApi(upskiiActors(actors).outsider);
  expect(
    JSON.stringify(await getJson(o, 'outsider classes', `${C}/classes`))
  ).not.toContain(classId);
  const { json } = await o('outsider class', `${C}/classes/${classId}`, {
    expect: REFUSED,
  });
  expect((json as Json | null)?.detail).toBeUndefined();
  await refused(
    o,
    'outsider assessments',
    'GET',
    `${C}/assessments?classId=${classId}`,
    REFUSED
  );
  await refused(
    o,
    'outsider quizzes',
    'GET',
    `${C}/course-quizzes?classId=${classId}`,
    REFUSED
  );
});

test('negatives: anonymous callers get 401', async () => {
  for (const path of [
    `${C}/classes`,
    `${C}/classes/${classId}`,
    `${C}/gradebook?classId=${classId}`,
  ])
    await anonymousStatus('upskiiApp', 'GET', path, ANONYMOUS);
  await anonymousStatus('upskiiApp', 'POST', `${C}/announcements`, ANONYMOUS);
});
