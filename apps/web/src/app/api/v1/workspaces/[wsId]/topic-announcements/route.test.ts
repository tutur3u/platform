import { describe, expect, it, vi } from 'vitest';
import { GET, POST } from './route';

const mocks = vi.hoisted(() => ({
  resolveTopicAnnouncementsAccess: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/auth-session-user', () => ({
  resolveAuthenticatedSessionUser: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock('@tuturuuu/utils/workspace-helper', () => ({
  getPermissions: vi.fn(),
  getSecret: vi.fn(),
  getSecrets: vi.fn(),
  normalizeWorkspaceId: vi.fn(),
}));

vi.mock('./shared', () => {
  return {
    insertTopicAnnouncementAttachmentDrafts: vi.fn(
      async ({
        actorUserId,
        announcementId,
        attachmentDrafts,
        normalizedWsId,
        sbAdmin,
      }: any) => {
        if (attachmentDrafts.length === 0) return;
        const { error } = await sbAdmin
          .from('topic_announcement_attachments')
          .insert(
            attachmentDrafts.map((attachment: any) => ({
              announcement_id: announcementId,
              content_type: attachment.contentType,
              created_by: actorUserId,
              file_name: attachment.fileName,
              size_bytes: attachment.sizeBytes,
              storage_path: attachment.storagePath,
              storage_provider: attachment.storageProvider,
              ws_id: normalizedWsId,
            }))
          );
        if (error) throw error;
      }
    ),
    mapTopicAnnouncementRow: vi.fn((announcement: any) => ({
      ...announcement,
      attachments: (announcement.attachments ?? []).map((attachment: any) => ({
        contentType: attachment.content_type,
        createdAt: attachment.created_at,
        fileName: attachment.file_name,
        id: attachment.id,
        sizeBytes: Number(attachment.size_bytes),
        storagePath: attachment.storage_path,
        storageProvider: attachment.storage_provider,
      })),
    })),
    resolveTopicAnnouncementsAccess: mocks.resolveTopicAnnouncementsAccess,
    serializeTopicAnnouncementContacts: vi.fn(async (_sbAdmin, contacts) =>
      contacts.map((contact: any) => ({
        ...contact,
        createdAt: contact.created_at,
        workspaceUserId: contact.workspace_user_id,
      }))
    ),
    TopicAnnouncementListQuerySchema: {
      safeParse: vi.fn((input: Record<string, string>) => ({
        data: {
          contactId: input.contactId,
          page: input.page ? Number(input.page) : 1,
          pageSize: input.pageSize ? Number(input.pageSize) : 20,
          q: input.q ?? '',
          status: input.status ?? 'active',
        },
        success: true,
      })),
    },
    TopicAnnouncementPayloadSchema: {
      safeParse: vi.fn((input: any) => ({
        data: {
          attachmentDrafts: input.attachmentDrafts ?? [],
          body: input.body ?? '',
          classLabel: input.classLabel ?? null,
          contactIds: input.contactIds,
          dayLabel: input.dayLabel ?? null,
          endTime: input.endTime ?? null,
          groupId: input.groupId ?? null,
          place: input.place ?? null,
          room: input.room ?? null,
          sessionDate: input.sessionDate ?? null,
          sourceType: input.sourceType ?? 'manual',
          startTime: input.startTime ?? null,
          status: input.status,
          title: input.title,
          topic: input.topic,
        },
        success: true,
      })),
    },
    validateTopicAnnouncementGroupId: vi.fn(async () => null),
  };
});

function createListQueryChain() {
  const chain: {
    eq: ReturnType<typeof vi.fn>;
    neq: ReturnType<typeof vi.fn>;
    order: ReturnType<typeof vi.fn>;
    range: ReturnType<typeof vi.fn>;
    select: ReturnType<typeof vi.fn>;
  } = {
    eq: vi.fn(() => chain),
    neq: vi.fn(() => chain),
    order: vi.fn(() => chain),
    range: vi.fn(async () => ({ count: 0, data: [], error: null })),
    select: vi.fn(() => chain),
  };

  return chain;
}

function setupAccess() {
  const queryChain = createListQueryChain();
  const sbAdmin = {
    from: vi.fn(() => queryChain),
  };

  mocks.resolveTopicAnnouncementsAccess.mockResolvedValue({
    context: {
      normalizedWsId: 'workspace-1',
      sbAdmin,
    },
  });

  return { queryChain, sbAdmin };
}

function params() {
  return {
    params: Promise.resolve({
      wsId: 'workspace-1',
    }),
  };
}

describe('topic announcements GET route', () => {
  it('hides cancelled announcements from the default active view', async () => {
    const { queryChain } = setupAccess();

    const response = await GET(new Request('http://localhost'), params());

    expect(response.status).toBe(200);
    expect(queryChain.neq).toHaveBeenCalledWith('status', 'cancelled');
  });

  it('keeps cancelled rows available through the explicit cancelled filter', async () => {
    const { queryChain } = setupAccess();

    const response = await GET(
      new Request('http://localhost?status=cancelled'),
      params()
    );

    expect(response.status).toBe(200);
    expect(queryChain.eq).toHaveBeenCalledWith('status', 'cancelled');
    expect(queryChain.neq).not.toHaveBeenCalled();
  });
});

describe('topic announcements POST route', () => {
  it('persists uploaded attachment descriptors with the created announcement', async () => {
    const attachmentInsert = vi.fn(async () => ({ error: null }));
    const announcement = {
      batch_id: null,
      body: 'Bring the PDF handout.',
      class_label: null,
      created_at: '2026-05-20T00:00:00.000Z',
      day_label: null,
      end_time: null,
      group_id: null,
      id: '123e4567-e89b-12d3-a456-426614174010',
      last_error: null,
      place: null,
      room: null,
      scheduled_send_at: null,
      sent_email_audit_id: null,
      sent_at: null,
      session_date: null,
      source_type: 'manual',
      start_time: null,
      status: 'draft',
      title: 'Unit 3 speaking practice',
      topic: 'Practice speaking about weekend plans.',
      ws_id: 'workspace-1',
    };
    const contactsQuery = {
      eq: vi.fn().mockReturnThis(),
      in: vi.fn(async () => ({
        data: [{ id: '123e4567-e89b-12d3-a456-426614174001' }],
        error: null,
      })),
      select: vi.fn().mockReturnThis(),
    };
    const insertAnnouncementQuery = {
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: announcement, error: null })),
        })),
      })),
    };
    const lookupAnnouncementQuery = {
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: announcement, error: null })),
      select: vi.fn().mockReturnThis(),
    };
    const recipientsQuery = {
      delete: vi.fn(() => ({
        eq: vi.fn(async () => ({ error: null })),
      })),
      insert: vi.fn(async () => ({ error: null })),
      select: vi.fn(() => ({
        eq: vi.fn(async () => ({ data: [], error: null })),
      })),
    };
    const attachmentsQuery = {
      insert: attachmentInsert,
      order: vi.fn(async () => ({
        data: [
          {
            content_type: 'application/pdf',
            created_at: '2026-05-20T00:00:00.000Z',
            file_name: 'lesson-plan.pdf',
            id: '123e4567-e89b-12d3-a456-426614174011',
            size_bytes: 1234,
            storage_path: 'topic-announcements/drafts/lesson-plan-1234.pdf',
            storage_provider: 'supabase',
          },
        ],
        error: null,
      })),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
    };
    let topicAnnouncementsCallCount = 0;
    const sbAdmin = {
      from: vi.fn((table: string) => {
        if (table === 'topic_announcement_contacts') return contactsQuery;
        if (table === 'topic_announcement_recipients') return recipientsQuery;
        if (table === 'topic_announcement_attachments') {
          return attachmentsQuery;
        }
        if (table === 'topic_announcements') {
          topicAnnouncementsCallCount += 1;
          return topicAnnouncementsCallCount === 1
            ? insertAnnouncementQuery
            : lookupAnnouncementQuery;
        }
        throw new Error(`Unexpected table ${table}`);
      }),
    };

    mocks.resolveTopicAnnouncementsAccess.mockResolvedValue({
      context: {
        actorUserId: '123e4567-e89b-12d3-a456-426614174099',
        normalizedWsId: 'workspace-1',
        sbAdmin,
      },
    });

    const response = await POST(
      new Request('http://localhost', {
        body: JSON.stringify({
          attachmentDrafts: [
            {
              contentType: 'application/pdf',
              fileName: 'lesson-plan.pdf',
              sizeBytes: 1234,
              storagePath: 'topic-announcements/drafts/lesson-plan-1234.pdf',
              storageProvider: 'supabase',
            },
          ],
          body: 'Bring the PDF handout.',
          contactIds: ['123e4567-e89b-12d3-a456-426614174001'],
          title: 'Unit 3 speaking practice',
          topic: 'Practice speaking about weekend plans.',
        }),
        method: 'POST',
      }),
      params()
    );

    expect(response.status).toBe(201);
    expect(attachmentInsert).toHaveBeenCalledWith([
      expect.objectContaining({
        announcement_id: announcement.id,
        content_type: 'application/pdf',
        file_name: 'lesson-plan.pdf',
        size_bytes: 1234,
        storage_path: 'topic-announcements/drafts/lesson-plan-1234.pdf',
        storage_provider: 'supabase',
        ws_id: 'workspace-1',
      }),
    ]);
  });
});
