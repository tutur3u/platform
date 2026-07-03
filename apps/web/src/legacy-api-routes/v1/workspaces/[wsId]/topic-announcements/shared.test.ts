import { beforeEach, describe, expect, it, vi } from 'vitest';

const storageMocks = vi.hoisted(() => ({
  downloadWorkspaceStorageObjectForProvider: vi.fn(),
  getWorkspaceStorageObjectMetadataForProvider: vi.fn(),
}));

vi.mock('@/lib/workspace-storage-provider', () => ({
  downloadWorkspaceStorageObjectForProvider:
    storageMocks.downloadWorkspaceStorageObjectForProvider,
  getWorkspaceStorageObjectMetadataForProvider:
    storageMocks.getWorkspaceStorageObjectMetadataForProvider,
  WorkspaceStorageError: class WorkspaceStorageError extends Error {
    constructor(
      message: string,
      public readonly status = 500
    ) {
      super(message);
    }
  },
}));

vi.mock('./server-helpers', () => ({
  attachTopicAnnouncementGroups: vi.fn(),
  getPrivateSchemaClient: vi.fn((client) => client),
  getPublicSchemaClient: vi.fn((client) => client),
  insertTopicAnnouncementAttachmentDrafts: vi.fn(),
  mapTopicAnnouncementRow: vi.fn(),
  resolveTopicAnnouncementsAccess: vi.fn(),
  serializeTopicAnnouncementAttachment: vi.fn(),
  serializeTopicAnnouncementContact: vi.fn(),
  serializeTopicAnnouncementContacts: vi.fn(),
}));

import { validateTopicAnnouncementAttachmentDraftObjects } from './shared';

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);

function attachmentDraft(overrides: Record<string, unknown> = {}) {
  return {
    contentType: 'application/pdf' as const,
    fileName: 'lesson-plan.pdf',
    sizeBytes: PDF_BYTES.byteLength,
    storagePath: 'topic-announcements/attachments/lesson-plan.pdf',
    storageProvider: 'supabase' as const,
    ...overrides,
  };
}

describe('validateTopicAnnouncementAttachmentDraftObjects', () => {
  beforeEach(() => {
    storageMocks.downloadWorkspaceStorageObjectForProvider.mockReset();
    storageMocks.getWorkspaceStorageObjectMetadataForProvider.mockReset();
    storageMocks.getWorkspaceStorageObjectMetadataForProvider.mockResolvedValue(
      {
        contentType: 'application/pdf',
        fullPath: 'workspace-1/topic-announcements/attachments/lesson-plan.pdf',
        path: 'topic-announcements/attachments/lesson-plan.pdf',
        provider: 'supabase',
        size: PDF_BYTES.byteLength,
        updatedAt: '2026-06-02T00:00:00.000Z',
      }
    );
    storageMocks.downloadWorkspaceStorageObjectForProvider.mockResolvedValue({
      buffer: PDF_BYTES,
      contentType: 'application/pdf',
    });
  });

  it('accepts an uploaded object whose actual metadata and bytes match the draft', async () => {
    const result = await validateTopicAnnouncementAttachmentDraftObjects({
      attachmentDrafts: [attachmentDraft()],
      normalizedWsId: 'workspace-1',
    });

    expect(result).toEqual({ ok: true });
    expect(
      storageMocks.getWorkspaceStorageObjectMetadataForProvider
    ).toHaveBeenCalledWith(
      'workspace-1',
      'supabase',
      'topic-announcements/attachments/lesson-plan.pdf'
    );
    expect(
      storageMocks.downloadWorkspaceStorageObjectForProvider
    ).toHaveBeenCalledWith(
      'workspace-1',
      'supabase',
      'topic-announcements/attachments/lesson-plan.pdf'
    );
  });

  it('rejects drafts that point outside the reserved attachment upload prefix', async () => {
    const result = await validateTopicAnnouncementAttachmentDraftObjects({
      attachmentDrafts: [
        attachmentDraft({
          storagePath: 'topic-announcements/drafts/lesson-plan.pdf',
        }),
      ],
      normalizedWsId: 'workspace-1',
    });

    expect(result).toEqual({
      message: 'Invalid Topic Announcement attachment path',
      ok: false,
      status: 400,
    });
    expect(
      storageMocks.getWorkspaceStorageObjectMetadataForProvider
    ).not.toHaveBeenCalled();
  });

  it('rejects drafts when the stored object size differs from the trusted claim', async () => {
    storageMocks.getWorkspaceStorageObjectMetadataForProvider.mockResolvedValue(
      {
        contentType: 'application/pdf',
        fullPath: 'workspace-1/topic-announcements/attachments/lesson-plan.pdf',
        path: 'topic-announcements/attachments/lesson-plan.pdf',
        provider: 'supabase',
        size: PDF_BYTES.byteLength + 1,
        updatedAt: '2026-06-02T00:00:00.000Z',
      }
    );

    const result = await validateTopicAnnouncementAttachmentDraftObjects({
      attachmentDrafts: [attachmentDraft()],
      normalizedWsId: 'workspace-1',
    });

    expect(result).toEqual({
      message:
        'Topic Announcement attachment metadata does not match the uploaded file',
      ok: false,
      status: 400,
    });
    expect(
      storageMocks.downloadWorkspaceStorageObjectForProvider
    ).not.toHaveBeenCalled();
  });

  it('rejects drafts when the stored bytes do not match the declared content type', async () => {
    storageMocks.downloadWorkspaceStorageObjectForProvider.mockResolvedValue({
      buffer: new Uint8Array([0x68, 0x65, 0x6c, 0x6c, 0x6f, 0x0a]),
      contentType: 'application/pdf',
    });

    const result = await validateTopicAnnouncementAttachmentDraftObjects({
      attachmentDrafts: [attachmentDraft()],
      normalizedWsId: 'workspace-1',
    });

    expect(result).toEqual({
      message:
        'Topic Announcement attachment content does not match the declared type',
      ok: false,
      status: 415,
    });
  });
});
