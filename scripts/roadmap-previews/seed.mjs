// Seeds the fictional "Sorbet Studio" workspace on the local stack through the
// app's own APIs. Only the display names (which need an abuse challenge in the
// public profile API) are written with the local Supabase service key.
//
//   node scripts/roadmap-previews/seed.mjs --state <file.json>
//
// Reads PREVIEW_SB_URL and PREVIEW_SB_SECRET from the environment (see
// capture-web.mjs for how they are resolved from `supabase status`).
import fs from 'node:fs';
import { parseArgs } from 'node:util';
import { admin, api, chromium, FIXTURE, log, signIn, TASKS } from './lib.mjs';

const DAY = 86400000;
const BOARD_NAME = 'Launch plan';

async function userIdFor(email) {
  const list = await admin('GET', `/auth/v1/admin/users?per_page=200`);
  const user = list.users.find((u) => u.email === email);
  if (!user) throw new Error(`No local user for ${email}`);
  return user.id;
}

async function nameUser(email, person) {
  const id = await userIdFor(email);
  const owned = await admin(
    'GET',
    `/rest/v1/handles?value=eq.${person.handle}&select=creator_id`
  );
  if (!owned.length) {
    await admin('POST', '/rest/v1/handles', {
      value: person.handle,
      creator_id: id,
    });
  }
  await admin('PATCH', `/rest/v1/users?id=eq.${id}`, {
    display_name: person.displayName,
    handle: person.handle,
  });
  await admin('PATCH', `/rest/v1/user_private_details?user_id=eq.${id}`, {
    full_name: person.displayName,
  });
  return id;
}

function dueAt(dayOffset) {
  const due = new Date(Date.now() + dayOffset * DAY);
  due.setHours(17, 0, 0, 0);
  return due.toISOString();
}

function at(dayOffset, hour, minutes = 0, durationMin = 60) {
  const start = new Date();
  start.setHours(hour, minutes, 0, 0);
  start.setTime(start.getTime() + dayOffset * DAY);
  return {
    start_at: start.toISOString(),
    end_at: new Date(start.getTime() + durationMin * 60000).toISOString(),
  };
}

const LABELS = [
  { name: 'Design', color: '#a78bfa' },
  { name: 'Web', color: '#60a5fa' },
  { name: 'Mobile', color: '#34d399' },
  { name: 'Research', color: '#fbbf24' },
];

// [list name, name, priority, label indexes, due day offset, description]
const TASK_FIXTURES = [
  [
    'To Do',
    'Plan the spring campaign calendar',
    'normal',
    [3],
    9,
    'Outline themes, owners and publishing dates for March to May.',
  ],
  [
    'To Do',
    'Collect customer quotes for the landing page',
    'low',
    [3],
    12,
    'Ask five studio clients for a short, attributed quote.',
  ],
  [
    'To Do',
    'Audit empty states across the mobile app',
    'normal',
    [2, 0],
    7,
    null,
  ],
  [
    'To Do',
    'Draft the partner onboarding guide',
    'normal',
    [3],
    6,
    'Cover access, billing and the first project setup.',
  ],
  ['To Do', 'Review the shared calendar sync copy', 'normal', [1], 4, null],
  [
    'In Progress',
    'Redesign the pricing page',
    'high',
    [0, 1],
    2,
    'Two plans, one comparison table, and a clearer annual toggle.',
  ],
  [
    'In Progress',
    'Prototype the onboarding checklist',
    'high',
    [0],
    3,
    'Three steps, progress ring, skippable at any point.',
  ],
  ['In Progress', 'Write release notes for 4.2', 'normal', [1], 1, null],
  [
    'Review',
    'QA the Android share sheet',
    'critical',
    [2],
    -1,
    'Verify attachments from Photos, Files and Drive.',
  ],
  ['Review', 'Polish the empty inbox illustration', 'low', [0], 0, null],
  ['Done', 'Ship the dark mode refresh', 'normal', [0, 1], -3, null],
  ['Done', 'Migrate the help center articles', 'low', [1], -5, null],
];

const EVENTS = [
  ['Weekly planning', 0, 9, 0, 45, 'Studio room'],
  ['Design critique', 0, 14, 0, 60, 'Studio room'],
  ['Pricing page review', 1, 10, 30, 60, 'Video call'],
  ['Focus: onboarding prototype', 1, 13, 0, 120, null],
  ['Customer interview: Mai Studio', 2, 11, 0, 45, 'Video call'],
  ['Release 4.2 go/no-go', 2, 15, 30, 30, null],
  ['Sprint demo', 3, 16, 0, 60, 'Main hall'],
  ['1:1 with Alex', 4, 10, 0, 30, null],
  ['Team lunch', 4, 12, 0, 60, 'Garden cafe'],
  ['Retrospective', 4, 15, 0, 60, 'Studio room'],
];

const tasksApi = (page, m, p, b) => api(page, m, p, b, TASKS);

export async function seed(stateFile) {
  const browser = await chromium.launch();
  const page = await (await browser.newContext()).newPage();
  try {
    await signIn(page, FIXTURE.teammate.email);
    const alexId = await nameUser(FIXTURE.teammate.email, FIXTURE.teammate);
    await signIn(page, FIXTURE.owner.email);
    const linhId = await nameUser(FIXTURE.owner.email, FIXTURE.owner);

    const workspaces = await api(page, 'GET', '/api/v1/workspaces');
    let ws = workspaces.find((w) => w.name === FIXTURE.workspaceName);
    const personal = workspaces.find((w) => w.personal);
    if (personal) {
      await admin('PATCH', `/rest/v1/workspaces?id=eq.${personal.id}`, {
        name: FIXTURE.owner.displayName,
      });
    }
    if (!ws) {
      ws = await api(page, 'POST', '/api/v1/workspaces/team', {
        name: FIXTURE.workspaceName,
      });
      log('workspace created', ws.id);
    }
    const wsId = ws.id;
    await admin('PATCH', `/rest/v1/workspaces?id=eq.${wsId}`, {
      timezone: 'Asia/Ho_Chi_Minh',
      first_day_of_week: 'monday',
    });
    const member = await admin(
      'GET',
      `/rest/v1/workspace_members?ws_id=eq.${wsId}&user_id=eq.${alexId}`
    );
    if (!member.length) {
      await admin('POST', '/rest/v1/workspace_members', {
        ws_id: wsId,
        user_id: alexId,
      });
    }

    const wsPath = `/api/v1/workspaces/${wsId}`;
    const existing = await tasksApi(page, 'GET', `${wsPath}/task-boards`);
    let board = (existing.boards ?? []).find(
      (b) => b.name === BOARD_NAME && !b.deleted_at && !b.archived_at
    );
    if (!board) {
      ({ board } = await tasksApi(page, 'POST', `${wsPath}/task-boards`, {
        name: BOARD_NAME,
        icon: null,
      }));
    }
    const boardId = board.id;
    if (board.ticket_prefix !== 'STU') {
      await admin('PATCH', `/rest/v1/workspace_boards?id=eq.${boardId}`, {
        ticket_prefix: 'STU',
      });
    }
    const { lists } = await tasksApi(
      page,
      'GET',
      `${wsPath}/task-boards/${boardId}/lists`
    );
    const byName = (name) => lists.find((l) => l.name === name).id;
    let state = { wsId, linhId, alexId, boardId };
    if (!board.task_count) {
      const labels = [];
      for (const l of LABELS) {
        const created = await tasksApi(page, 'POST', `${wsPath}/labels`, l);
        labels.push(created.id ?? created.label?.id);
      }
      const taskIds = [];
      for (const [
        listName,
        name,
        priority,
        lbl,
        due,
        description,
      ] of TASK_FIXTURES) {
        const t = await tasksApi(page, 'POST', `${wsPath}/tasks`, {
          name,
          listId: byName(listName),
          priority,
          description,
          end_date: dueAt(due),
          label_ids: lbl.map((i) => labels[i]),
          assignee_ids: [name.length % 2 ? linhId : alexId],
        });
        taskIds.push(t.task?.id ?? t.id);
      }
      state = { ...state, labels, taskIds };
    }

    const haveEvents = await admin(
      'GET',
      `/rest/v1/workspace_calendar_events?ws_id=eq.${wsId}&select=id&limit=1`
    );
    if (!haveEvents.length) {
      const monday = -((new Date().getDay() + 6) % 7);
      const colors = ['BLUE', 'GREEN', 'PURPLE', 'ORANGE', 'PINK'];
      await admin(
        'POST',
        '/rest/v1/workspace_calendar_events',
        EVENTS.map(([title, day, h, m, dur, location], i) => ({
          ws_id: wsId,
          title,
          location,
          color: colors[i % colors.length],
          locked: false,
          is_encrypted: false,
          ...at(monday + day, h, m, dur),
        }))
      );
    }
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
    log('seeded', JSON.stringify({ wsId, boardId }));
    return state;
  } finally {
    await browser.close();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { values } = parseArgs({ options: { state: { type: 'string' } } });
  await seed(values.state ?? 'tmp-state.json');
}
