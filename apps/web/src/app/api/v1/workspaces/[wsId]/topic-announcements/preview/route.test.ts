import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const mocks = vi.hoisted(() => ({
  resolveTopicAnnouncementsAccess: vi.fn(),
  safeParse: vi.fn(),
  validateTopicAnnouncementGroupId: vi.fn(),
}));

vi.mock('../shared', () => ({
  resolveTopicAnnouncementsAccess: mocks.resolveTopicAnnouncementsAccess,
  TopicAnnouncementPayloadSchema: {
    safeParse: mocks.safeParse,
  },
  validateTopicAnnouncementGroupId: mocks.validateTopicAnnouncementGroupId,
}));

function params() {
  return {
    params: Promise.resolve({
      wsId: 'workspace-1',
    }),
  };
}

function createAccess() {
  const contactsQuery = {
    eq: vi.fn().mockReturnThis(),
    in: vi.fn(async () => ({
      data: [{ id: '123e4567-e89b-12d3-a456-426614174001' }],
      error: null,
    })),
    select: vi.fn().mockReturnThis(),
  };
  const workspaceQuery = {
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn(async () => ({
      data: { name: 'Demo Workspace' },
      error: null,
    })),
    select: vi.fn().mockReturnThis(),
  };
  const sbAdmin = {
    from: vi.fn((table: string) => {
      if (table === 'topic_announcement_contacts') return contactsQuery;
      if (table === 'workspaces') return workspaceQuery;
      throw new Error(`Unexpected table ${table}`);
    }),
  };

  mocks.resolveTopicAnnouncementsAccess.mockResolvedValue({
    context: {
      normalizedWsId: 'workspace-1',
      sbAdmin,
    },
  });
  mocks.validateTopicAnnouncementGroupId.mockResolvedValue(null);

  return { contactsQuery, sbAdmin, workspaceQuery };
}

describe('topic announcement preview route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.safeParse.mockReturnValue({
      data: {
        attachmentDrafts: [
          {
            contentType: 'application/pdf',
            fileName: 'lesson-plan.pdf',
            sizeBytes: 1234,
            storagePath: 'topic-announcements/drafts/lesson-plan.pdf',
            storageProvider: 'supabase',
          },
        ],
        body: '',
        classLabel: 'HUONG-EGET1',
        contactIds: ['123e4567-e89b-12d3-a456-426614174001'],
        dayLabel: 'Saturday',
        endTime: '18:00',
        groupId: null,
        place: 'CENTER 1',
        room: '6',
        sessionDate: '2026-06-01',
        sourceType: 'manual',
        startTime: '16:30',
        title: 'Unit 3 speaking practice',
        topic: 'Practice <speaking>.\nBring notes.',
      },
      success: true,
    });
  });

  it('renders the validated payload with workspace context and attachments', async () => {
    const { contactsQuery } = createAccess();

    const response = await POST(
      new Request('http://localhost', {
        body: JSON.stringify({ title: 'Unit 3 speaking practice' }),
        method: 'POST',
      }),
      params()
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(contactsQuery.in).toHaveBeenCalledWith('id', [
      '123e4567-e89b-12d3-a456-426614174001',
    ]);
    expect(json.data.subject).toBe('Unit 3 speaking practice');
    expect(json.data.html).toContain('Demo Workspace');
    expect(json.data.html).toContain('Practice &lt;speaking&gt;');
    expect(json.data.html).toContain('lesson-plan.pdf');
    expect(json.data.text).toContain('Attachments:');
    expect(json.data.attachments).toHaveLength(1);
  });

  it('rejects invalid preview payloads', async () => {
    createAccess();
    mocks.safeParse.mockReturnValueOnce({
      error: { issues: [{ message: 'Title is required' }] },
      success: false,
    });

    const response = await POST(
      new Request('http://localhost', {
        body: JSON.stringify({}),
        method: 'POST',
      }),
      params()
    );

    expect(response.status).toBe(400);
  });
});
