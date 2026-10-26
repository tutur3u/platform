import { describe, expect, it } from 'vitest';
import {
  buildTopicAnnouncementListOrFilter,
  buildTopicAnnouncementTeacherFilter,
  decideTopicAnnouncementAccessMode,
  isTopicAnnouncementAssignedToScope,
  validateTeacherTopicAnnouncementWrite,
} from './access';
import {
  TopicAnnouncementPayloadSchema,
  TopicAnnouncementUpdateSchema,
} from './schemas';

const has =
  (...permissions: string[]) =>
  (permission: string) =>
    permissions.includes(permission);

const teacher = {
  groupIds: ['group-a'],
  kind: 'teacher' as const,
  workspaceUserId: 'wu-1',
};

describe('decideTopicAnnouncementAccessMode', () => {
  it('keeps manage_users as the supervisor scope', () => {
    expect(
      decideTopicAnnouncementAccessMode({
        hasPermission: has('manage_users'),
        requireManage: true,
        teacherAccess: 'update',
      })
    ).toBe('manager');
  });

  it('keeps supervisor sending gated on manage_users plus send', () => {
    expect(
      decideTopicAnnouncementAccessMode({
        hasPermission: has('manage_users'),
        requireSend: true,
      })
    ).toBe('denied');
  });

  it.each([
    ['update', 'update_user_groups_posts'],
    ['read', 'update_user_groups_posts'],
    ['read', 'create_user_groups_posts'],
    ['send', 'send_user_group_post_emails'],
  ] as const)(
    'grants the teacher branch for %s with %s',
    (access, permission) => {
      expect(
        decideTopicAnnouncementAccessMode({
          hasPermission: has(permission),
          requireManage: access !== 'send',
          requireSend: access === 'send',
          teacherAccess: access,
          teacherAssignmentsEnabled: true,
        })
      ).toBe('teacher');
      // The teacher branch does not exist while the workspace flag is off.
      expect(
        decideTopicAnnouncementAccessMode({
          hasPermission: has(permission),
          requireManage: access !== 'send',
          requireSend: access === 'send',
          teacherAccess: access,
        })
      ).toBe('denied');
    }
  );

  it('denies the teacher branch without opt-in or permission', () => {
    expect(
      decideTopicAnnouncementAccessMode({
        hasPermission: has('update_user_groups_posts'),
        requireManage: true,
      })
    ).toBe('denied');
    expect(
      decideTopicAnnouncementAccessMode({
        hasPermission: has('create_user_groups_posts'),
        requireManage: true,
        teacherAccess: 'update',
      })
    ).toBe('denied');
  });
});

describe('teacher assignment helpers', () => {
  it('matches the linked teacher or a TEACHER class', () => {
    expect(
      isTopicAnnouncementAssignedToScope(
        { teacher_workspace_user_id: 'wu-1' },
        teacher
      )
    ).toBe(true);
    expect(
      isTopicAnnouncementAssignedToScope({ group_id: 'group-a' }, teacher)
    ).toBe(true);
    // A co-teacher of the class cannot act on another teacher's topic.
    expect(
      isTopicAnnouncementAssignedToScope(
        { group_id: 'group-a', teacher_workspace_user_id: 'wu-2' },
        teacher
      )
    ).toBe(false);
    expect(
      isTopicAnnouncementAssignedToScope(
        { group_id: 'group-b', teacher_workspace_user_id: 'wu-2' },
        teacher
      )
    ).toBe(false);
  });

  it('builds a PostgREST filter for both assignment paths', () => {
    expect(buildTopicAnnouncementTeacherFilter(teacher)).toBe(
      'teacher_workspace_user_id.eq.wu-1,and(teacher_workspace_user_id.is.null,group_id.in.(group-a))'
    );
    expect(
      buildTopicAnnouncementTeacherFilter({ ...teacher, groupIds: [] })
    ).toBe('teacher_workspace_user_id.eq.wu-1');
  });

  it('lets teachers change only the topic content', () => {
    expect(
      validateTeacherTopicAnnouncementWrite({
        next: {
          attachmentDrafts: [],
          body: 'b',
          courseBook: 'c',
          sessionDate: undefined,
          status: 'draft',
          topic: 't',
          videoUrl: null,
        },
        scope: teacher,
      })
    ).toBeNull();
    expect(
      validateTeacherTopicAnnouncementWrite({
        next: { groupId: null, sessionDate: '2026-11-01', topic: 't' },
        scope: teacher,
      })
    ).toEqual({
      message: 'Teachers cannot change: groupId, sessionDate',
      status: 403,
    });
    expect(
      validateTeacherTopicAnnouncementWrite({
        next: { status: 'queued' },
        scope: teacher,
      })
    ).toMatchObject({ status: 403 });
    expect(
      validateTeacherTopicAnnouncementWrite({
        next: { sessionDate: '2026-11-01' },
        scope: { kind: 'manager' },
      })
    ).toBeNull();
  });

  it('quotes the search so it cannot widen the teacher scope', () => {
    expect(
      buildTopicAnnouncementListOrFilter({ q: 'a"b\\c,(d)', scope: teacher })
    ).toBe(
      'and(or(teacher_workspace_user_id.eq.wu-1,and(teacher_workspace_user_id.is.null,group_id.in.(group-a))),or(title.ilike."%a\\"b\\\\c,(d)%",topic.ilike."%a\\"b\\\\c,(d)%",class_label.ilike."%a\\"b\\\\c,(d)%"))'
    );
    expect(buildTopicAnnouncementListOrFilter({ q: '', scope: teacher })).toBe(
      'teacher_workspace_user_id.eq.wu-1,and(teacher_workspace_user_id.is.null,group_id.in.(group-a))'
    );
    expect(
      buildTopicAnnouncementListOrFilter({ q: '', scope: { kind: 'manager' } })
    ).toBeNull();
  });
});

describe('topic announcement schemas', () => {
  const base = {
    contactIds: ['00000000-0000-4000-8000-000000000001'],
    title: 'Session',
  };

  it('allows an empty topic only for drafts', () => {
    expect(TopicAnnouncementPayloadSchema.safeParse(base).success).toBe(true);
    expect(
      TopicAnnouncementPayloadSchema.safeParse({ ...base, status: 'queued' })
        .success
    ).toBe(false);
  });

  it('validates course book and video link like the database', () => {
    expect(
      TopicAnnouncementPayloadSchema.safeParse({
        ...base,
        courseBook: 'x'.repeat(201),
      }).success
    ).toBe(false);
    for (const videoUrl of ['http://a.test', 'https://a.test/x y']) {
      expect(
        TopicAnnouncementPayloadSchema.safeParse({ ...base, videoUrl }).success
      ).toBe(false);
    }
    expect(
      TopicAnnouncementPayloadSchema.parse({ ...base, videoUrl: '' }).videoUrl
    ).toBeNull();
  });

  it('keeps omitted update fields undefined', () => {
    expect(TopicAnnouncementUpdateSchema.parse({ topic: 'New' })).toEqual({
      topic: 'New',
    });
  });
});
