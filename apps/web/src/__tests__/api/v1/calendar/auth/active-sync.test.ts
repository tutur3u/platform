import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock Supabase modules
const mockCreateAdminClient = vi.fn();
const mockCreateClient = vi.fn();

vi.mock('@tuturuuu/supabase/next/server', () => ({
  createAdminClient: mockCreateAdminClient,
  createClient: mockCreateClient,
}));

// Mock the entire Supabase package to prevent import errors
vi.mock('@tuturuuu/supabase/next/client', () => ({
  createClient: mockCreateClient,
  createDynamicClient: vi.fn(),
}));

vi.mock('@tuturuuu/supabase/next/common', () => ({
  checkEnvVariables: vi.fn(() => ({
    url: 'https://test.supabase.co',
    key: 'test-key',
  })),
}));

// Mock NextResponse
vi.mock('next/server', () => ({
  NextResponse: {
    json: vi.fn((data, options) => ({
      json: () => data,
      status: options?.status || 200,
    })),
  },
}));

// Mock the utils
vi.mock('@tuturuuu/utils/calendar-sync-coordination', () => ({
  updateLastUpsert: vi.fn(() => Promise.resolve()),
}));

vi.mock('@tuturuuu/utils/constants', () => ({
  DEV_MODE: true,
}));

// Mock any other utils that might be imported
vi.mock('@tuturuuu/utils', () => ({
  updateLastUpsert: vi.fn(() => Promise.resolve()),
}));

// Mock types package
vi.mock('@tuturuuu/types/db', () => ({
  WorkspaceCalendarEvent: {},
}));

// Mock Supabase types
vi.mock('@tuturuuu/types/supabase', () => ({
  Database: {},
}));

// Mock Supabase SSR package
vi.mock('@supabase/ssr', () => ({
  createBrowserClient: vi.fn(() => ({})),
  createServerClient: vi.fn(() => ({})),
}));

// Mock Next.js cookies
vi.mock('next/headers', () => ({
  cookies: vi.fn(() => ({
    getAll: vi.fn(() => []),
    set: vi.fn(),
  })),
}));

// Mock dayjs
vi.mock('dayjs', () => ({
  default: vi.fn(() => ({
    startOf: vi.fn(() => ({
      toISOString: vi.fn(() => '2024-01-01T00:00:00.000Z'),
    })),
    endOf: vi.fn(() => ({
      toISOString: vi.fn(() => '2024-01-31T23:59:59.999Z'),
    })),
    add: vi.fn(() => ({
      toISOString: vi.fn(() => '2024-02-01T00:00:00.000Z'),
    })),
  })),
}));

// Mock crypto
Object.defineProperty(global, 'crypto', {
  value: {
    randomUUID: vi.fn(() => 'test-uuid-123'),
  },
});

// Mock fetch
global.fetch = vi.fn();

// Define proper types for mocks
type MockSupabaseClient = {
  auth: {
    getUser: ReturnType<typeof vi.fn>;
  };
  from: ReturnType<typeof vi.fn>;
  rpc: ReturnType<typeof vi.fn>;
};

type MockNextResponse = {
  json: ReturnType<typeof vi.fn>;
};

describe('POST /api/v1/calendar/auth/active-sync', () => {
  let mockAdminClient: MockSupabaseClient;
  let mockClient: MockSupabaseClient;
  let mockNextResponse: MockNextResponse;
  let mockUpdateLastUpsert: any;
  let mockFetch: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock admin client
    mockAdminClient = {
      auth: {
        getUser: vi.fn(),
      },
      from: vi.fn(),
      rpc: vi.fn(),
    };

    // Setup mock regular client
    mockClient = {
      auth: {
        getUser: vi.fn(),
      },
      from: vi.fn(),
      rpc: vi.fn(),
    };

    // Setup NextResponse mock
    mockNextResponse = {
      json: vi.fn((data, options) => ({
        json: () => data,
        status: options?.status || 200,
      })),
    };

    // Setup other mocks
    mockUpdateLastUpsert = vi.mocked(
      require('@tuturuuu/utils/calendar-sync-coordination').updateLastUpsert
    );
    mockFetch = vi.mocked(global.fetch);

    // Mock the module functions
    mockCreateAdminClient.mockResolvedValue(mockAdminClient);
    mockCreateClient.mockResolvedValue(mockClient);

    // Setup default mock behaviors
    mockClient.from.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          lt: vi.fn(() => ({
            gt: vi.fn(() => ({
              order: vi.fn(() => Promise.resolve({ data: [], error: null })),
            })),
          })),
        })),
      })),
      delete: vi.fn(() => ({
        in: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
      rpc: vi.fn(() =>
        Promise.resolve({ data: { inserted: 0, updated: 0 }, error: null })
      ),
    });

    mockAdminClient.from.mockReturnValue({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(() =>
            Promise.resolve({ data: { id: 'dashboard-id' }, error: null })
          ),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null })),
      })),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const createMockRequest = (
    body: any,
    headers: Record<string, string> = {}
  ) => {
    return new Request(
      'http://localhost:3000/api/v1/calendar/auth/active-sync',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify(body),
      }
    );
  };

  const setupAuthenticatedUser = () => {
    const mockUser = { id: 'test-user-id', email: 'test@example.com' };
    mockClient.auth.getUser.mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });
  };

  describe('Request validation', () => {
    it('should return 400 when wsId is missing', async () => {
      const request = createMockRequest({
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      const { POST } = await import(
        '@/app/api/v1/calendar/auth/active-sync/route'
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('wsId is required');
    });

    it('should return 400 when startDate is missing', async () => {
      const request = createMockRequest({
        wsId: 'test-ws-id',
        endDate: '2024-01-31',
      });

      const { POST } = await import(
        '@/app/api/v1/calendar/auth/active-sync/route'
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('startDate and endDate are required');
    });

    it('should return 400 when endDate is missing', async () => {
      const request = createMockRequest({
        wsId: 'test-ws-id',
        startDate: '2024-01-01',
      });

      const { POST } = await import(
        '@/app/api/v1/calendar/auth/active-sync/route'
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(400);
      expect(data.error).toBe('startDate and endDate are required');
    });
  });

  describe('Authentication', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockClient.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const request = createMockRequest({
        wsId: 'test-ws-id',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      const { POST } = await import(
        '@/app/api/v1/calendar/auth/active-sync/route'
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error).toBe('User not authenticated');
    });
  });

  describe('Dashboard record creation', () => {
    it('should create dashboard record successfully', async () => {
      setupAuthenticatedUser();

      const request = createMockRequest({
        wsId: 'test-ws-id',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      // Mock successful Google Calendar fetch
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            events: [
              {
                id: 'event-1',
                google_event_id: 'google-event-1',
                summary: 'Test Event 1',
                start_at: '2024-01-01T10:00:00Z',
                end_at: '2024-01-01T11:00:00Z',
              },
            ],
          }),
      });

      const { POST } = await import(
        '@/app/api/v1/calendar/auth/active-sync/route'
      );
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockAdminClient.from).toHaveBeenCalledWith(
        'calendar_sync_dashboard'
      );
    });

    it('should return 500 when dashboard creation fails', async () => {
      setupAuthenticatedUser();

      mockAdminClient.from.mockReturnValue({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: null,
                error: { message: 'Database error' },
              })
            ),
          })),
        })),
      });

      const request = createMockRequest({
        wsId: 'test-ws-id',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      const { POST } = await import(
        '@/app/api/v1/calendar/auth/active-sync/route'
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Database error');
    });
  });

  describe('Database operations', () => {
    it('should fetch existing events from database', async () => {
      setupAuthenticatedUser();

      const existingEvents = [
        {
          id: 'db-event-1',
          google_event_id: 'google-event-1',
          summary: 'Existing Event 1',
          start_at: '2024-01-01T10:00:00Z',
          end_at: '2024-01-01T11:00:00Z',
        },
      ];

      mockClient.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            lt: vi.fn(() => ({
              gt: vi.fn(() => ({
                order: vi.fn(() =>
                  Promise.resolve({ data: existingEvents, error: null })
                ),
              })),
            })),
          })),
        })),
        delete: vi.fn(() => ({
          in: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
        rpc: vi.fn(() =>
          Promise.resolve({ data: { inserted: 1, updated: 0 }, error: null })
        ),
      });

      // Mock successful Google Calendar fetch
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            events: [
              {
                id: 'event-1',
                google_event_id: 'google-event-1',
                summary: 'Updated Event 1',
                start_at: '2024-01-01T10:00:00Z',
                end_at: '2024-01-01T11:00:00Z',
              },
            ],
          }),
      });

      const request = createMockRequest({
        wsId: 'test-ws-id',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      const { POST } = await import(
        '@/app/api/v1/calendar/auth/active-sync/route'
      );
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockClient.from).toHaveBeenCalledWith('workspace_calendar_events');
    });

    it('should return 500 when database fetch fails', async () => {
      setupAuthenticatedUser();

      mockClient.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            lt: vi.fn(() => ({
              gt: vi.fn(() => ({
                order: vi.fn(() =>
                  Promise.resolve({
                    data: null,
                    error: { message: 'Database error' },
                  })
                ),
              })),
            })),
          })),
        })),
      });

      const request = createMockRequest({
        wsId: 'test-ws-id',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      const { POST } = await import(
        '@/app/api/v1/calendar/auth/active-sync/route'
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Database error');
    });
  });

  describe('Google Calendar integration', () => {
    it('should fetch events from Google Calendar successfully', async () => {
      setupAuthenticatedUser();

      const googleEvents = [
        {
          id: 'event-1',
          google_event_id: 'google-event-1',
          summary: 'Google Event 1',
          start_at: '2024-01-01T10:00:00Z',
          end_at: '2024-01-01T11:00:00Z',
        },
      ];

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ events: googleEvents }),
      });

      const request = createMockRequest(
        {
          wsId: 'test-ws-id',
          startDate: '2024-01-01',
          endDate: '2024-01-31',
        },
        {
          cookie: 'test-cookie=value',
        }
      );

      const { POST } = await import(
        '@/app/api/v1/calendar/auth/active-sync/route'
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/calendar/auth/fetch'),
        expect.objectContaining({
          headers: {
            Cookie: 'test-cookie=value',
          },
        })
      );
      expect(data.googleData).toEqual(googleEvents);
    });

    it('should return 500 when Google Calendar fetch fails', async () => {
      setupAuthenticatedUser();

      mockFetch.mockResolvedValue({
        ok: false,
        json: () =>
          Promise.resolve({
            error: 'Google Calendar error',
            googleError: 'API Error',
            details: { reason: 'Rate limit exceeded' },
          }),
      });

      const request = createMockRequest({
        wsId: 'test-ws-id',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      const { POST } = await import(
        '@/app/api/v1/calendar/auth/active-sync/route'
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe(
        'Google Calendar error. API Error: Rate limit exceeded'
      );
    });
  });

  describe('Event deletion', () => {
    it('should delete events that are no longer in Google Calendar', async () => {
      setupAuthenticatedUser();

      const existingEvents = [
        {
          id: 'db-event-1',
          google_event_id: 'google-event-1',
          summary: 'Event to be deleted',
          start_at: '2024-01-01T10:00:00Z',
          end_at: '2024-01-01T11:00:00Z',
        },
        {
          id: 'db-event-2',
          google_event_id: 'google-event-2',
          summary: 'Event to keep',
          start_at: '2024-01-02T10:00:00Z',
          end_at: '2024-01-02T11:00:00Z',
        },
      ];

      mockClient.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            lt: vi.fn(() => ({
              gt: vi.fn(() => ({
                order: vi.fn(() =>
                  Promise.resolve({ data: existingEvents, error: null })
                ),
              })),
            })),
          })),
        })),
        delete: vi.fn(() => ({
          in: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
        rpc: vi.fn(() =>
          Promise.resolve({ data: { inserted: 0, updated: 1 }, error: null })
        ),
      });

      // Mock Google Calendar with only one event (event-2)
      mockFetch.mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            events: [
              {
                id: 'event-2',
                google_event_id: 'google-event-2',
                summary: 'Event to keep',
                start_at: '2024-01-02T10:00:00Z',
                end_at: '2024-01-02T11:00:00Z',
              },
            ],
          }),
      });

      const request = createMockRequest({
        wsId: 'test-ws-id',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      const { POST } = await import(
        '@/app/api/v1/calendar/auth/active-sync/route'
      );
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockClient.from().delete).toHaveBeenCalledWith();
      expect(mockClient.from().delete().in).toHaveBeenCalledWith('id', [
        'db-event-1',
      ]);
    });

    it('should return 500 when event deletion fails', async () => {
      setupAuthenticatedUser();

      const existingEvents = [
        {
          id: 'db-event-1',
          google_event_id: 'google-event-1',
          summary: 'Event to be deleted',
          start_at: '2024-01-01T10:00:00Z',
          end_at: '2024-01-01T11:00:00Z',
        },
      ];

      mockClient.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            lt: vi.fn(() => ({
              gt: vi.fn(() => ({
                order: vi.fn(() =>
                  Promise.resolve({ data: existingEvents, error: null })
                ),
              })),
            })),
          })),
        })),
        delete: vi.fn(() => ({
          in: vi.fn(() =>
            Promise.resolve({ data: null, error: { message: 'Delete failed' } })
          ),
        })),
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ events: [] }),
      });

      const request = createMockRequest({
        wsId: 'test-ws-id',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      const { POST } = await import(
        '@/app/api/v1/calendar/auth/active-sync/route'
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Delete failed');
    });
  });

  describe('Event upsert', () => {
    it('should upsert events successfully', async () => {
      setupAuthenticatedUser();

      const googleEvents = [
        {
          id: 'event-1',
          google_event_id: 'google-event-1',
          summary: 'New Event',
          start_at: '2024-01-01T10:00:00Z',
          end_at: '2024-01-01T11:00:00Z',
        },
      ];

      mockClient.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            lt: vi.fn(() => ({
              gt: vi.fn(() => ({
                order: vi.fn(() => Promise.resolve({ data: [], error: null })),
              })),
            })),
          })),
        })),
        delete: vi.fn(() => ({
          in: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
        rpc: vi.fn(() =>
          Promise.resolve({ data: { inserted: 1, updated: 0 }, error: null })
        ),
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ events: googleEvents }),
      });

      const request = createMockRequest({
        wsId: 'test-ws-id',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      const { POST } = await import(
        '@/app/api/v1/calendar/auth/active-sync/route'
      );
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockClient.rpc).toHaveBeenCalledWith(
        'upsert_calendar_events_and_count',
        {
          events: [
            {
              ...googleEvents[0],
              id: 'test-uuid-123',
              ws_id: 'test-ws-id',
            },
          ],
        }
      );
      expect(mockUpdateLastUpsert).toHaveBeenCalledWith(
        'test-ws-id',
        mockClient
      );
    });

    it('should update existing events with correct IDs', async () => {
      setupAuthenticatedUser();

      const existingEvents = [
        {
          id: 'existing-event-id',
          google_event_id: 'google-event-1',
          summary: 'Existing Event',
          start_at: '2024-01-01T10:00:00Z',
          end_at: '2024-01-01T11:00:00Z',
        },
      ];

      const googleEvents = [
        {
          id: 'event-1',
          google_event_id: 'google-event-1',
          summary: 'Updated Event',
          start_at: '2024-01-01T10:00:00Z',
          end_at: '2024-01-01T11:00:00Z',
        },
      ];

      mockClient.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            lt: vi.fn(() => ({
              gt: vi.fn(() => ({
                order: vi.fn(() =>
                  Promise.resolve({ data: existingEvents, error: null })
                ),
              })),
            })),
          })),
        })),
        delete: vi.fn(() => ({
          in: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
        rpc: vi.fn(() =>
          Promise.resolve({ data: { inserted: 0, updated: 1 }, error: null })
        ),
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ events: googleEvents }),
      });

      const request = createMockRequest({
        wsId: 'test-ws-id',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      const { POST } = await import(
        '@/app/api/v1/calendar/auth/active-sync/route'
      );
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockClient.rpc).toHaveBeenCalledWith(
        'upsert_calendar_events_and_count',
        {
          events: [
            {
              ...googleEvents[0],
              id: 'existing-event-id',
              ws_id: 'test-ws-id',
            },
          ],
        }
      );
    });

    it('should return 500 when upsert fails', async () => {
      setupAuthenticatedUser();

      mockClient.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            lt: vi.fn(() => ({
              gt: vi.fn(() => ({
                order: vi.fn(() => Promise.resolve({ data: [], error: null })),
              })),
            })),
          })),
        })),
        delete: vi.fn(() => ({
          in: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
        rpc: vi.fn(() =>
          Promise.resolve({ data: null, error: { message: 'Upsert failed' } })
        ),
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ events: [] }),
      });

      const request = createMockRequest({
        wsId: 'test-ws-id',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      const { POST } = await import(
        '@/app/api/v1/calendar/auth/active-sync/route'
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Upsert failed');
    });
  });

  describe('Dashboard record update', () => {
    it('should update dashboard record with sync results in DEV_MODE', async () => {
      setupAuthenticatedUser();

      mockClient.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            lt: vi.fn(() => ({
              gt: vi.fn(() => ({
                order: vi.fn(() => Promise.resolve({ data: [], error: null })),
              })),
            })),
          })),
        })),
        delete: vi.fn(() => ({
          in: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
        rpc: vi.fn(() =>
          Promise.resolve({ data: { inserted: 2, updated: 1 }, error: null })
        ),
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ events: [] }),
      });

      const request = createMockRequest({
        wsId: 'test-ws-id',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      const { POST } = await import(
        '@/app/api/v1/calendar/auth/active-sync/route'
      );
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockAdminClient.from().update).toHaveBeenCalledWith({
        inserted_events: 2,
        updated_events: 1,
        deleted_events: 0,
        status: 'completed',
        end_time: expect.any(String),
      });
    });

    it('should return 500 when dashboard update fails', async () => {
      setupAuthenticatedUser();

      mockAdminClient.from.mockReturnValue({
        insert: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(() =>
              Promise.resolve({
                data: { id: 'dashboard-id', ws_id: 'test-ws-id' },
                error: null,
              })
            ),
          })),
        })),
        update: vi.fn(() => ({
          eq: vi.fn(() =>
            Promise.resolve({ data: null, error: { message: 'Update failed' } })
          ),
        })),
      });

      mockClient.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            lt: vi.fn(() => ({
              gt: vi.fn(() => ({
                order: vi.fn(() => Promise.resolve({ data: [], error: null })),
              })),
            })),
          })),
        })),
        delete: vi.fn(() => ({
          in: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
        rpc: vi.fn(() =>
          Promise.resolve({ data: { inserted: 1, updated: 0 }, error: null })
        ),
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ events: [] }),
      });

      const request = createMockRequest({
        wsId: 'test-ws-id',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      const { POST } = await import(
        '@/app/api/v1/calendar/auth/active-sync/route'
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Update failed');
    });
  });

  describe('Error handling', () => {
    it('should handle unexpected errors gracefully', async () => {
      mockCreateClient.mockImplementation(() => {
        throw new Error('Unexpected error');
      });

      const request = createMockRequest({
        wsId: 'test-ws-id',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      const { POST } = await import(
        '@/app/api/v1/calendar/auth/active-sync/route'
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Unexpected error');
    });

    it('should handle non-Error objects in catch block', async () => {
      mockCreateClient.mockImplementation(() => {
        throw 'String error';
      });

      const request = createMockRequest({
        wsId: 'test-ws-id',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      const { POST } = await import(
        '@/app/api/v1/calendar/auth/active-sync/route'
      );
      const response = await POST(request);
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data.error).toBe('Unknown error');
    });
  });

  describe('Base URL configuration', () => {
    it('should use NEXT_PUBLIC_BASE_URL when available', async () => {
      const originalEnv = process.env.NEXT_PUBLIC_BASE_URL;
      process.env.NEXT_PUBLIC_BASE_URL = 'https://example.com';

      setupAuthenticatedUser();

      mockClient.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            lt: vi.fn(() => ({
              gt: vi.fn(() => ({
                order: vi.fn(() => Promise.resolve({ data: [], error: null })),
              })),
            })),
          })),
        })),
        delete: vi.fn(() => ({
          in: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
        rpc: vi.fn(() =>
          Promise.resolve({ data: { inserted: 0, updated: 0 }, error: null })
        ),
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ events: [] }),
      });

      const request = createMockRequest({
        wsId: 'test-ws-id',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      const { POST } = await import(
        '@/app/api/v1/calendar/auth/active-sync/route'
      );
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          'https://example.com/api/v1/calendar/auth/fetch'
        ),
        expect.any(Object)
      );

      // Restore original environment
      process.env.NEXT_PUBLIC_BASE_URL = originalEnv;
    });

    it('should fallback to localhost when NEXT_PUBLIC_BASE_URL is not set', async () => {
      const originalEnv = process.env.NEXT_PUBLIC_BASE_URL;
      delete process.env.NEXT_PUBLIC_BASE_URL;

      setupAuthenticatedUser();

      mockClient.from.mockReturnValue({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            lt: vi.fn(() => ({
              gt: vi.fn(() => ({
                order: vi.fn(() => Promise.resolve({ data: [], error: null })),
              })),
            })),
          })),
        })),
        delete: vi.fn(() => ({
          in: vi.fn(() => Promise.resolve({ data: null, error: null })),
        })),
        rpc: vi.fn(() =>
          Promise.resolve({ data: { inserted: 0, updated: 0 }, error: null })
        ),
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ events: [] }),
      });

      const request = createMockRequest({
        wsId: 'test-ws-id',
        startDate: '2024-01-01',
        endDate: '2024-01-31',
      });

      const { POST } = await import(
        '@/app/api/v1/calendar/auth/active-sync/route'
      );
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(
          'http://localhost:3000/api/v1/calendar/auth/fetch'
        ),
        expect.any(Object)
      );

      // Restore original environment
      process.env.NEXT_PUBLIC_BASE_URL = originalEnv;
    });
  });
});
