import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreateAdminClient = vi.hoisted(() => vi.fn());
const mockHeaders = vi.hoisted(() => vi.fn());
const mockGetAuthenticatedUserContext = vi.hoisted(() => vi.fn());
const mockHasSentResponseCopyEmail = vi.hoisted(() => vi.fn());
const mockFetchFormDefinition = vi.hoisted(() => vi.fn());
const mockGetReadOnlyAnswersForResponder = vi.hoisted(() => vi.fn());
const mockGetSessionMetadata = vi.hoisted(() => vi.fn());

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mockCreateAdminClient,
}));

vi.mock('server-only', () => ({}));

vi.mock('next/headers', () => ({
  headers: mockHeaders,
}));

vi.mock('@/features/forms/response-copy-email', () => ({
  getAuthenticatedUserContext: mockGetAuthenticatedUserContext,
  hasSentResponseCopyEmail: mockHasSentResponseCopyEmail,
}));

vi.mock('@/features/forms/server', () => ({
  fetchFormDefinition: mockFetchFormDefinition,
  getReadOnlyAnswersForResponder: mockGetReadOnlyAnswersForResponder,
  getSessionMetadata: mockGetSessionMetadata,
}));

import {
  buildSharedFormSnapshotResult,
  loadSharedFormForPage,
  loadSharedFormSnapshot,
} from './shared-form-loader';

function createFormDefinition(
  accessMode: 'anonymous' | 'authenticated' = 'anonymous'
) {
  return {
    id: 'form-1',
    wsId: 'ws-1',
    creatorId: 'user-1',
    title: '<p>Shared form</p>',
    description: '<p>Fill this out</p>',
    status: 'published' as const,
    accessMode,
    openAt: null,
    closeAt: null,
    maxResponses: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    shareCode: 'share-1',
    theme: {
      presetId: 'editorial-moss',
      density: 'balanced' as const,
      accentColor: 'dynamic-green' as const,
      headlineFontId: 'noto-serif' as const,
      bodyFontId: 'be-vietnam-pro' as const,
      surfaceStyle: 'paper' as const,
      coverHeadline: '',
      coverImage: {
        storagePath: '',
        url: '',
        alt: '',
      },
      sectionImages: {},
      typography: {
        displaySize: 'md' as const,
        headingSize: 'md' as const,
        bodySize: 'md' as const,
      },
    },
    settings: {
      showProgressBar: true,
      allowMultipleSubmissions: true,
      oneResponsePerUser: false,
      requireTurnstile: true,
      confirmationTitle: 'Thanks',
      confirmationMessage: 'Done',
    },
    sections: [
      {
        id: 'section-1',
        title: 'Section 1',
        description: '',
        image: { storagePath: '', url: '', alt: '' },
        questions: [
          {
            id: 'question-1',
            sectionId: 'section-1',
            type: 'short_text' as const,
            title: 'Question',
            description: '',
            required: false,
            image: { storagePath: '', url: '', alt: '' },
            settings: {},
            options: [],
          },
        ],
      },
    ],
    logicRules: [],
  };
}

function createLoadedRecord(
  overrides?: Partial<Parameters<typeof buildSharedFormSnapshotResult>[0]>
) {
  return {
    adminClient: {} as Awaited<ReturnType<typeof mockCreateAdminClient>>,
    shareLink: {
      id: 'share-link-1',
      form_id: 'form-1',
      active: true,
    },
    form: {
      id: 'form-1',
      ws_id: 'ws-1',
      status: 'published',
      access_mode: 'anonymous',
      open_at: null,
      close_at: null,
    },
    definition: createFormDefinition(),
    accessMode: 'anonymous' as const,
    ...overrides,
  };
}

function createAdminClientMock({
  shareLink = {
    id: 'share-link-1',
    form_id: 'form-1',
    active: true,
  },
  form = {
    id: 'form-1',
    ws_id: 'ws-1',
    status: 'published',
    access_mode: 'anonymous',
    open_at: null,
    close_at: null,
  },
  existingResponse = null as { id: string } | null,
  sessionId = 'session-1',
} = {}) {
  const insertPayloads: unknown[] = [];

  const chain = <T>(result: T) => {
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      maybeSingle: vi.fn().mockResolvedValue({ data: result }),
    };

    return builder;
  };

  const shareLinkQuery = chain(shareLink);
  const formQuery = chain(form);
  const responseQuery = chain(existingResponse);
  const sessionInsertSelect = {
    single: vi.fn().mockResolvedValue({
      data: { id: sessionId },
      error: null,
    }),
  };
  const formSessionsQuery = {
    insert: vi.fn((payload: unknown) => {
      insertPayloads.push(payload);
      return {
        select: vi.fn(() => sessionInsertSelect),
      };
    }),
  };

  const adminClient = {
    from: vi.fn((table: string) => {
      if (table === 'form_share_links') {
        return shareLinkQuery;
      }
      if (table === 'forms') {
        return formQuery;
      }
      if (table === 'form_responses') {
        return responseQuery;
      }
      if (table === 'form_sessions') {
        return formSessionsQuery;
      }
      throw new Error(`Unexpected table: ${table}`);
    }),
  };

  return { adminClient, insertPayloads };
}

describe('shared-form-loader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHeaders.mockResolvedValue(new Headers());
    mockGetAuthenticatedUserContext.mockResolvedValue({
      user: null,
      authenticatedEmail: null,
    });
    mockHasSentResponseCopyEmail.mockResolvedValue(false);
    mockFetchFormDefinition.mockResolvedValue(createFormDefinition());
    mockGetReadOnlyAnswersForResponder.mockResolvedValue({
      answers: { 'question-1': 'done' },
      issues: [],
      submittedAt: '2026-03-17T00:00:00.000Z',
      responseId: 'response-1',
      sessionId: 'session-existing',
    });
    mockGetSessionMetadata.mockReturnValue({
      referrerDomain: 'example.com',
      deviceType: 'desktop',
      browser: 'Chrome',
      os: 'macOS',
      country: 'VN',
      city: 'HCMC',
    });
  });

  it('returns protected fallback from the snapshot path for non-anonymous forms', () => {
    const result = buildSharedFormSnapshotResult(
      createLoadedRecord({
        form: {
          id: 'form-1',
          ws_id: 'ws-1',
          status: 'published',
          access_mode: 'authenticated',
          open_at: null,
          close_at: null,
        },
        definition: createFormDefinition('authenticated'),
        accessMode: 'authenticated',
      })
    );

    expect(result).toEqual({
      status: 401,
      data: null,
    });
  });

  it('returns unavailable statuses from the snapshot path', () => {
    const missing = buildSharedFormSnapshotResult(
      createLoadedRecord({
        shareLink: null,
        form: null,
        definition: null,
      })
    );
    const closed = buildSharedFormSnapshotResult(
      createLoadedRecord({
        form: {
          id: 'form-1',
          ws_id: 'ws-1',
          status: 'closed',
          access_mode: 'anonymous',
          open_at: null,
          close_at: null,
        },
      })
    );

    expect(missing).toEqual({ status: 404, data: null });
    expect(closed).toEqual({ status: 410, data: null });
  });

  it('loads anonymous snapshots without creating a session', async () => {
    const { adminClient, insertPayloads } = createAdminClientMock();
    mockCreateAdminClient.mockResolvedValue(adminClient);

    const result = await loadSharedFormSnapshot('share-1');

    expect(result.status).toBe(200);
    expect(result.data?.form.id).toBe('form-1');
    expect(insertPayloads).toHaveLength(0);
  });

  it('creates a session only for interactive page loads that can respond', async () => {
    const { adminClient, insertPayloads } = createAdminClientMock();
    mockCreateAdminClient.mockResolvedValue(adminClient);

    const result = await loadSharedFormForPage('share-1');

    expect(result.status).toBe(200);
    expect(result.data?.sessionId).toBe('session-1');
    expect(result.data?.form.id).toBe('form-1');
    expect(insertPayloads).toHaveLength(1);
  });

  it('returns read-only prior responses without creating a session', async () => {
    const { adminClient, insertPayloads } = createAdminClientMock({
      form: {
        id: 'form-1',
        ws_id: 'ws-1',
        status: 'published',
        access_mode: 'authenticated',
        open_at: null,
        close_at: null,
      },
      existingResponse: { id: 'response-1' },
    });
    mockCreateAdminClient.mockResolvedValue(adminClient);
    mockFetchFormDefinition.mockResolvedValue({
      ...createFormDefinition('authenticated'),
      settings: {
        showProgressBar: true,
        allowMultipleSubmissions: true,
        oneResponsePerUser: true,
        requireTurnstile: true,
        confirmationTitle: 'Thanks',
        confirmationMessage: 'Done',
      },
    });
    mockGetAuthenticatedUserContext.mockResolvedValue({
      user: { id: 'user-1' },
      authenticatedEmail: 'user@example.com',
    });

    const result = await loadSharedFormForPage('share-1');

    expect(result.status).toBe(200);
    expect(result.data?.readOnly).toBe(true);
    expect(result.data?.readOnlyResponseId).toBe('response-1');
    expect(result.data?.canRequestResponseCopy).toBe(true);
    expect(insertPayloads).toHaveLength(0);
  });
});
