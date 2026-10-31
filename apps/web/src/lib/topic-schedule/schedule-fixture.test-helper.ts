import { createFakeSupabase } from '@/legacy-api-routes/v1/workspaces/[wsId]/topic-announcements/topic-announcement-fake-supabase.test-helper';

/** Shared workspace fixture for the GVNN schedule route tests. */
export const SUPERVISOR = '00000000-0000-4000-8000-0000000000a9';
export const WS = '00000000-0000-4000-8000-000000000001';
export const OTHER_WS = '00000000-0000-4000-8000-000000000002';
export const K1 = '00000000-0000-4000-8000-0000000000c1'; // one teacher
export const K2 = '00000000-0000-4000-8000-0000000000c2'; // two teachers
export const K3 = '00000000-0000-4000-8000-0000000000c3'; // no teacher
export const FOREIGN_GROUP = '00000000-0000-4000-8000-0000000000c9';
export const T1 = '00000000-0000-4000-8000-0000000000b1';
export const T2 = '00000000-0000-4000-8000-0000000000b2';
export const T3 = '00000000-0000-4000-8000-0000000000b3';
export const GVNN = '00000000-0000-4000-8000-0000000000d1';
export const GVNN_2 = '00000000-0000-4000-8000-0000000000d2';
export const FOREIGN_CONTACT = '00000000-0000-4000-8000-0000000000d9';
export const FOREIGN_SESSION = '00000000-0000-4000-8000-0000000000e9';

export const ARCHIVED_GROUP = '00000000-0000-4000-8000-0000000000c8';
export const ARCHIVED_CONTACT = '00000000-0000-4000-8000-0000000000d8';

function member(groupId: string, userId: string, createdAt: string, ws = WS) {
  return {
    created_at: createdAt,
    group_id: groupId,
    role: 'TEACHER',
    user_id: userId,
    workspace_user_groups: { ws_id: ws },
  };
}

export function createScheduleFixture() {
  return createFakeSupabase({
    topic_announcement_batches: [],
    topic_announcement_contacts: [
      {
        archived: false,
        email: 'a@x.test',
        id: GVNN,
        name: 'Anna',
        tags: ['GVNN'],
        ws_id: WS,
      },
      {
        archived: false,
        email: 'b@x.test',
        id: GVNN_2,
        name: 'Ben',
        tags: ['gvnn'],
        ws_id: WS,
      },
      {
        archived: false,
        email: 'p@x.test',
        id: 'parent',
        name: 'Parent',
        tags: [],
        ws_id: WS,
      },
      {
        archived: false,
        email: 'f@x.test',
        id: FOREIGN_CONTACT,
        name: 'F',
        tags: ['GVNN'],
        ws_id: OTHER_WS,
      },
      {
        archived: true,
        email: 'old@x.test',
        id: ARCHIVED_CONTACT,
        name: 'Old',
        tags: ['GVNN'],
        ws_id: WS,
      },
    ],
    topic_announcement_recipients: [],
    topic_announcements: [
      {
        group_id: FOREIGN_GROUP,
        id: FOREIGN_SESSION,
        session_date: '2026-11-03',
        source_type: 'schedule',
        start_time: '17:30:00',
        status: 'draft',
        ws_id: OTHER_WS,
      },
    ],
    workspace_user_groups: [
      { archived: false, id: K1, name: 'K1', ws_id: WS },
      { archived: false, id: K2, name: 'K2', ws_id: WS },
      { archived: null, id: K3, name: 'K3', ws_id: WS },
      { archived: true, id: ARCHIVED_GROUP, name: 'Old class', ws_id: WS },
      { archived: false, id: FOREIGN_GROUP, name: 'X', ws_id: OTHER_WS },
    ],
    workspace_user_groups_users: [
      member(K1, T1, '2026-09-01T00:00:00Z'),
      member(K2, T2, '2026-09-05T00:00:00Z'),
      member(K2, T3, '2026-09-02T00:00:00Z'),
      { ...member(K3, T1, '2026-09-01T00:00:00Z'), role: 'STUDENT' },
      member(FOREIGN_GROUP, T1, '2026-09-01T00:00:00Z', OTHER_WS),
    ],
    workspace_users: [
      { full_name: 'Thu', id: T1, ws_id: WS },
      { full_name: 'Lan', id: T2, ws_id: WS },
      { full_name: 'Mai', id: T3, ws_id: WS },
    ],
    workspaces: [{ id: WS, personal: false, timezone: 'Asia/Ho_Chi_Minh' }],
  });
}
