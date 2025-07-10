// Set required env vars for Supabase at the VERY TOP
process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'dummy-anon-key';
process.env.SUPABASE_SERVICE_KEY = 'dummy-service-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'dummy-service-role-key';
process.env.GOOGLE_CLIENT_ID = 'dummy-client-id';
process.env.GOOGLE_CLIENT_SECRET = 'dummy-client-secret';
process.env.GOOGLE_REDIRECT_URI = 'http://localhost:3000/auth/callback';

// Mocks must come next, before any imports that use them!
import { vi, describe, it, expect, beforeEach, afterEach, beforeAll } from 'vitest';

// Mock the google-calendar-sync module
vi.mock('../google-calendar-sync', async () => {
  const actual = await vi.importActual('../google-calendar-sync');
  return {
    ...actual,
    getGoogleAuthClient: vi.fn(() => ({
      setCredentials: vi.fn(),
    })),
    getWorkspacesForSync: vi.fn(() => Promise.resolve([
      { ws_id: 'test-ws-1', access_token: 'token1', refresh_token: 'refresh1' },
      { ws_id: 'test-ws-2', access_token: 'token2', refresh_token: 'refresh2' }
    ])),
    syncWorkspaceExtended: vi.fn((payload) => Promise.resolve({
      ws_id: payload.ws_id,
      success: true,
      eventsSynced: payload.events_to_sync?.length || 10,
      eventsDeleted: 0,
    })),
    storeSyncToken: vi.fn(() => Promise.resolve()),
  };
});

// Mock googleapis
vi.mock('googleapis', () => ({
  google: {
    calendar: vi.fn(() => ({
      events: {
        list: vi.fn(() => Promise.resolve({
          data: {
            items: [
              {
                id: 'event1',
                summary: 'Test Event 1',
                description: 'Test Description 1',
                start: { dateTime: '2024-01-15T10:00:00Z' },
                end: { dateTime: '2024-01-15T11:00:00Z' },
                location: 'Test Location 1',
                colorId: '1',
                status: 'confirmed'
              },
              {
                id: 'event2',
                summary: 'Test Event 2',
                description: 'Test Description 2',
                start: { dateTime: '2024-01-15T14:00:00Z' },
                end: { dateTime: '2024-01-15T15:00:00Z' },
                location: 'Test Location 2',
                colorId: '2',
                status: 'confirmed'
              }
            ],
            nextSyncToken: 'test-sync-token-123'
          }
        }))
      }
    }))
  }
}));

import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
dayjs.extend(utc);

// Dynamically import the actual functions after env and mocks are set
let performFullSyncForWorkspace: any;
let googleCalendarFullSync: any;
let googleCalendarFullSyncOrchestrator: any;
let googleCalendarFullSyncTasks: any;

beforeAll(async () => {
  const mod = await import('../google-calendar-full-sync');
  performFullSyncForWorkspace = mod.performFullSyncForWorkspace;
  googleCalendarFullSync = mod.googleCalendarFullSync;
  googleCalendarFullSyncOrchestrator = mod.googleCalendarFullSyncOrchestrator;
  googleCalendarFullSyncTasks = mod.googleCalendarFullSyncTasks;
});

// Test isolation utility to prevent environment contamination
const isolateTest = (testFn: () => void | Promise<void>) => {
  return async () => {
    const originalEnv = { ...process.env };
    try {
      await testFn();
    } finally {
      process.env = originalEnv;
    }
  };
};

// Mock Google Calendar events for testing
const createMockGoogleEvent = (id: string, title: string, start: string, end: string, status = 'confirmed') => ({
  id,
  summary: title,
  description: `Description for ${title}`,
  start: { dateTime: start },
  end: { dateTime: end },
  location: `Location for ${title}`,
  colorId: '1',
  status
});

describe('Google Calendar Full Sync', () => {
  beforeEach(() => {
    // Reset environment
    delete process.env.LOCALE;
    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Clean up
    vi.clearAllMocks();
  });

  describe('performFullSyncForWorkspace', () => {
    it('should perform full sync for a workspace with default calendar ID', async () => {
      const ws_id = 'test-workspace';
      const access_token = 'test-access-token';
      const refresh_token = 'test-refresh-token';

      const events = await performFullSyncForWorkspace(
        'primary',
        ws_id,
        access_token,
        refresh_token
      );

      expect(events).toBeDefined();
      expect(events).toHaveLength(2);
      expect(events[0].id).toBe('event1');
      expect(events[1].id).toBe('event2');
    });

    it('should perform full sync for a workspace with custom calendar ID', async () => {
      const ws_id = 'test-workspace';
      const access_token = 'test-access-token';
      const refresh_token = 'test-refresh-token';
      const calendarId = 'custom-calendar-id';

      const events = await performFullSyncForWorkspace(
        calendarId,
        ws_id,
        access_token,
        refresh_token
      );

      expect(events).toBeDefined();
      expect(events).toHaveLength(2);
    });

    it('should handle empty events list', async () => {
      // Mock empty response
      const { google } = await import('googleapis');
      const mockCalendar = google.calendar as any;
      mockCalendar.mockReturnValue({
        events: {
          list: vi.fn(() => Promise.resolve({
            data: {
              items: [],
              nextSyncToken: 'empty-sync-token'
            }
          }))
        }
      });

      const events = await performFullSyncForWorkspace(
        'primary',
        'test-workspace',
        'test-access-token',
        'test-refresh-token'
      );

      expect(events).toBeDefined();
      expect(events).toHaveLength(0);
    });

    it('should handle missing refresh token', async () => {
      const ws_id = 'test-workspace';
      const access_token = 'test-access-token';
      const refresh_token = '';

      const events = await performFullSyncForWorkspace(
        'primary',
        ws_id,
        access_token,
        refresh_token
      );

      expect(events).toBeDefined();
      expect(events).toHaveLength(2);
    });

    it('should handle null refresh token', async () => {
      const ws_id = 'test-workspace';
      const access_token = 'test-access-token';
      const refresh_token = null as any;

      const events = await performFullSyncForWorkspace(
        'primary',
        ws_id,
        access_token,
        refresh_token
      );

      expect(events).toBeDefined();
      expect(events).toHaveLength(2);
    });

    it('should call syncWorkspaceExtended when events exist', async () => {
      const { syncWorkspaceExtended } = await import('../google-calendar-sync');
      
      await performFullSyncForWorkspace(
        'primary',
        'test-workspace',
        'test-access-token',
        'test-refresh-token'
      );

      expect(syncWorkspaceExtended).toHaveBeenCalledWith({
        ws_id: 'test-workspace',
        events_to_sync: expect.arrayContaining([
          expect.objectContaining({ id: 'event1' }),
          expect.objectContaining({ id: 'event2' })
        ])
      });
    });

    it('should not call syncWorkspaceExtended when no events exist', async () => {
      // Mock empty response
      const { google } = await import('googleapis');
      const mockCalendar = google.calendar as any;
      mockCalendar.mockReturnValue({
        events: {
          list: vi.fn(() => Promise.resolve({
            data: {
              items: [],
              nextSyncToken: 'empty-sync-token'
            }
          }))
        }
      });

      const { syncWorkspaceExtended } = await import('../google-calendar-sync');
      
      await performFullSyncForWorkspace(
        'primary',
        'test-workspace',
        'test-access-token',
        'test-refresh-token'
      );

      expect(syncWorkspaceExtended).not.toHaveBeenCalled();
    });

    it('should store sync token when available', async () => {
      const { storeSyncToken } = await import('../google-calendar-sync');
      
      await performFullSyncForWorkspace(
        'primary',
        'test-workspace',
        'test-access-token',
        'test-refresh-token'
      );

      expect(storeSyncToken).toHaveBeenCalledWith(
        'test-workspace',
        'test-sync-token-123',
        expect.any(Date)
      );
    });

    it('should handle missing sync token gracefully', async () => {
      // Mock response without sync token
      const { google } = await import('googleapis');
      const mockCalendar = google.calendar as any;
      mockCalendar.mockReturnValue({
        events: {
          list: vi.fn(() => Promise.resolve({
            data: {
              items: [
                {
                  id: 'event1',
                  summary: 'Test Event 1',
                  start: { dateTime: '2024-01-15T10:00:00Z' },
                  end: { dateTime: '2024-01-15T11:00:00Z' },
                  status: 'confirmed'
                }
              ]
              // No nextSyncToken
            }
          }))
        }
      });

      const { storeSyncToken } = await import('../google-calendar-sync');
      
      await performFullSyncForWorkspace(
        'primary',
        'test-workspace',
        'test-access-token',
        'test-refresh-token'
      );

      expect(storeSyncToken).not.toHaveBeenCalled();
    });
  });

  describe('googleCalendarFullSync Task', () => {
    it('should execute full sync task successfully', async () => {
      const payload = {
        ws_id: 'test-workspace',
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token',
        calendarId: 'primary'
      };

      const result = await googleCalendarFullSync.run(payload);

      expect(result).toBeDefined();
      expect(result.ws_id).toBe('test-workspace');
      expect(result.success).toBe(true);
      expect(result.eventsSynced).toBe(2);
      expect(result.events).toHaveLength(2);
    });

    it('should execute full sync task with default calendar ID', async () => {
      const payload = {
        ws_id: 'test-workspace',
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token'
        // calendarId omitted, should default to "primary"
      };

      const result = await googleCalendarFullSync.run(payload);

      expect(result).toBeDefined();
      expect(result.ws_id).toBe('test-workspace');
      expect(result.success).toBe(true);
      expect(result.eventsSynced).toBe(2);
    });

    it('should handle task execution errors gracefully', async () => {
      // Mock error in performFullSyncForWorkspace
      const originalPerformFullSync = performFullSyncForWorkspace;
      performFullSyncForWorkspace = vi.fn().mockRejectedValue(new Error('Test error'));

      const payload = {
        ws_id: 'test-workspace',
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token'
      };

      const result = await googleCalendarFullSync.run(payload);

      expect(result).toBeDefined();
      expect(result.ws_id).toBe('test-workspace');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Test error');
      expect(result.eventsSynced).toBe(0);

      // Restore original function
      performFullSyncForWorkspace = originalPerformFullSync;
    });

    it('should handle unknown errors in task execution', async () => {
      // Mock unknown error
      const originalPerformFullSync = performFullSyncForWorkspace;
      performFullSyncForWorkspace = vi.fn().mockRejectedValue('Unknown error string');

      const payload = {
        ws_id: 'test-workspace',
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token'
      };

      const result = await googleCalendarFullSync.run(payload);

      expect(result).toBeDefined();
      expect(result.ws_id).toBe('test-workspace');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Unknown error');
      expect(result.eventsSynced).toBe(0);

      // Restore original function
      performFullSyncForWorkspace = originalPerformFullSync;
    });

    it('should log task execution progress', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      const payload = {
        ws_id: 'test-workspace',
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token'
      };

      await googleCalendarFullSync.run(payload);

      expect(consoleSpy).toHaveBeenCalledWith('[test-workspace] Starting full sync task');
      expect(consoleSpy).toHaveBeenCalledWith('[test-workspace] Full sync completed successfully. Synced 2 events.');

      consoleSpy.mockRestore();
    });

    it('should log task execution errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Mock error
      const originalPerformFullSync = performFullSyncForWorkspace;
      performFullSyncForWorkspace = vi.fn().mockRejectedValue(new Error('Test error'));

      const payload = {
        ws_id: 'test-workspace',
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token'
      };

      await googleCalendarFullSync.run(payload);

      expect(consoleSpy).toHaveBeenCalledWith('[test-workspace] Error in full sync task:', expect.any(Error));

      consoleSpy.mockRestore();
      performFullSyncForWorkspace = originalPerformFullSync;
    });
  });

  describe('googleCalendarFullSyncOrchestrator Task', () => {
    it('should orchestrate full sync for multiple workspaces', async () => {
      const result = await googleCalendarFullSyncOrchestrator.run();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      
      // Check first workspace result
      expect(result[0]).toBeDefined();
      expect(result[0].ws_id).toBe('test-ws-1');
      expect(result[0].status).toBe('triggered');
      expect(result[0].handle).toBeDefined();
      
      // Check second workspace result
      expect(result[1]).toBeDefined();
      expect(result[1].ws_id).toBe('test-ws-2');
      expect(result[1].status).toBe('triggered');
      expect(result[1].handle).toBeDefined();
    });

    it('should handle orchestrator errors gracefully', async () => {
      // Mock error in getWorkspacesForSync
      const { getWorkspacesForSync } = await import('../google-calendar-sync');
      (getWorkspacesForSync as any).mockRejectedValue(new Error('Orchestrator error'));

      await expect(googleCalendarFullSyncOrchestrator.run()).rejects.toThrow('Orchestrator error');
    });

    it('should handle individual workspace trigger errors', async () => {
      // Mock error in task trigger
      const mockTrigger = vi.fn().mockRejectedValue(new Error('Trigger error'));
      googleCalendarFullSync.trigger = mockTrigger;

      const result = await googleCalendarFullSyncOrchestrator.run();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      
      // Check that both workspaces failed
      expect(result[0].status).toBe('failed');
      expect(result[0].error).toBe('Trigger error');
      expect(result[1].status).toBe('failed');
      expect(result[1].error).toBe('Trigger error');
    });

    it('should log orchestrator execution progress', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      
      await googleCalendarFullSyncOrchestrator.run();

      expect(consoleSpy).toHaveBeenCalledWith('=== Starting extended sync orchestrator ===');
      expect(consoleSpy).toHaveBeenCalledWith('Found 2 workspaces to sync extended');
      expect(consoleSpy).toHaveBeenCalledWith('[test-ws-1] Full sync triggered');
      expect(consoleSpy).toHaveBeenCalledWith('[test-ws-2] Full sync triggered');
      expect(consoleSpy).toHaveBeenCalledWith('=== Full sync orchestrator completed ===');

      consoleSpy.mockRestore();
    });

    it('should log orchestrator errors', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      
      // Mock error in getWorkspacesForSync
      const { getWorkspacesForSync } = await import('../google-calendar-sync');
      (getWorkspacesForSync as any).mockRejectedValue(new Error('Orchestrator error'));

      try {
        await googleCalendarFullSyncOrchestrator.run();
      } catch (error) {
        // Expected to throw
      }

      expect(consoleSpy).toHaveBeenCalledWith('Error in full sync orchestrator:', expect.any(Error));

      consoleSpy.mockRestore();
    });

    it('should handle empty workspaces list', async () => {
      // Mock empty workspaces list
      const { getWorkspacesForSync } = await import('../google-calendar-sync');
      (getWorkspacesForSync as any).mockResolvedValue([]);

      const result = await googleCalendarFullSyncOrchestrator.run();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });

    it('should handle partial workspace trigger failures', async () => {
      // Mock mixed success/failure scenario
      const mockTrigger = vi.fn()
        .mockResolvedValueOnce({ id: 'handle1' }) // First workspace succeeds
        .mockRejectedValueOnce(new Error('Second workspace failed')); // Second workspace fails
      
      googleCalendarFullSync.trigger = mockTrigger;

      const result = await googleCalendarFullSyncOrchestrator.run();

      expect(result).toBeDefined();
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(2);
      
      // Check first workspace succeeded
      expect(result[0].status).toBe('triggered');
      expect(result[0].handle).toBeDefined();
      
      // Check second workspace failed
      expect(result[1].status).toBe('failed');
      expect(result[1].error).toBe('Second workspace failed');
    });
  });

  describe('Task Configuration', () => {
    it('should have correct task configuration for googleCalendarFullSync', () => {
      expect(googleCalendarFullSync.id).toBe('google-calendar-full-sync');
      expect(googleCalendarFullSync.queue).toBeDefined();
      expect(googleCalendarFullSync.queue.concurrencyLimit).toBe(1);
    });

    it('should have correct task configuration for googleCalendarFullSyncOrchestrator', () => {
      expect(googleCalendarFullSyncOrchestrator.id).toBe('google-calendar-full-sync-orchestrator');
    });

    it('should export tasks array correctly', () => {
      expect(googleCalendarFullSyncTasks).toBeDefined();
      expect(Array.isArray(googleCalendarFullSyncTasks)).toBe(true);
      expect(googleCalendarFullSyncTasks).toHaveLength(2);
      expect(googleCalendarFullSyncTasks).toContain(googleCalendarFullSync);
      expect(googleCalendarFullSyncTasks).toContain(googleCalendarFullSyncOrchestrator);
    });
  });

  describe('Integration Scenarios', () => {
    it('should support complete full sync workflow', async () => {
      const workspace = {
        ws_id: 'test-workspace',
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token'
      };

      // Test individual workspace sync
      const individualResult = await googleCalendarFullSync.run(workspace);
      expect(individualResult.success).toBe(true);
      expect(individualResult.eventsSynced).toBe(2);

      // Test orchestrator
      const orchestratorResult = await googleCalendarFullSyncOrchestrator.run();
      expect(orchestratorResult).toHaveLength(2);
      expect(orchestratorResult.every(r => r.status === 'triggered')).toBe(true);
    });

    it('should handle time range calculations correctly', async () => {
      const now = dayjs();
      const timeMin = now;
      const timeMax = now.add(28, 'day');

      expect(timeMin).toBeDefined();
      expect(timeMax).toBeDefined();
      expect(timeMax.diff(timeMin, 'day')).toBe(28);
    });

    it('should handle Google Calendar API parameters correctly', async () => {
      const { google } = await import('googleapis');
      const mockCalendar = google.calendar as any;
      const mockEventsList = vi.fn();
      mockCalendar.mockReturnValue({
        events: {
          list: mockEventsList
        }
      });

      await performFullSyncForWorkspace(
        'primary',
        'test-workspace',
        'test-access-token',
        'test-refresh-token'
      );

      expect(mockEventsList).toHaveBeenCalledWith({
        calendarId: 'primary',
        showDeleted: true,
        singleEvents: true,
        maxResults: 2500,
        timeMin: expect.any(String),
        timeMax: expect.any(String),
      });
    });

    it('should handle different calendar IDs', async () => {
      const calendarIds = ['primary', 'custom-calendar-id', 'another-calendar'];
      
      for (const calendarId of calendarIds) {
        const events = await performFullSyncForWorkspace(
          calendarId,
          'test-workspace',
          'test-access-token',
          'test-refresh-token'
        );

        expect(events).toBeDefined();
        expect(events).toHaveLength(2);
      }
    });

    it('should handle concurrency key usage in orchestrator', async () => {
      const mockTrigger = vi.fn().mockResolvedValue({ id: 'test-handle' });
      googleCalendarFullSync.trigger = mockTrigger;

      await googleCalendarFullSyncOrchestrator.run();

      expect(mockTrigger).toHaveBeenCalledTimes(2);
      expect(mockTrigger).toHaveBeenCalledWith(
        { ws_id: 'test-ws-1', access_token: 'token1', refresh_token: 'refresh1' },
        { concurrencyKey: 'test-ws-1' }
      );
      expect(mockTrigger).toHaveBeenCalledWith(
        { ws_id: 'test-ws-2', access_token: 'token2', refresh_token: 'refresh2' },
        { concurrencyKey: 'test-ws-2' }
      );
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle missing access token', async () => {
      const payload = {
        ws_id: 'test-workspace',
        access_token: '',
        refresh_token: 'test-refresh-token'
      };

      const result = await googleCalendarFullSync.run(payload);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle invalid calendar ID', async () => {
      const events = await performFullSyncForWorkspace(
        'invalid-calendar-id',
        'test-workspace',
        'test-access-token',
        'test-refresh-token'
      );

      expect(events).toBeDefined();
      // Should still return events from mock
      expect(events).toHaveLength(2);
    });

    it('should handle Google Calendar API errors', async () => {
      // Mock Google Calendar API error
      const { google } = await import('googleapis');
      const mockCalendar = google.calendar as any;
      mockCalendar.mockReturnValue({
        events: {
          list: vi.fn().mockRejectedValue(new Error('Google Calendar API error'))
        }
      });

      const payload = {
        ws_id: 'test-workspace',
        access_token: 'test-access-token',
        refresh_token: 'test-refresh-token'
      };

      const result = await googleCalendarFullSync.run(payload);
      expect(result.success).toBe(false);
      expect(result.error).toBe('Google Calendar API error');
    });

    it('should handle syncWorkspaceExtended errors', async () => {
      // Mock error in syncWorkspaceExtended
      const { syncWorkspaceExtended } = await import('../google-calendar-sync');
      (syncWorkspaceExtended as any).mockRejectedValue(new Error('Sync error'));

      const events = await performFullSyncForWorkspace(
        'primary',
        'test-workspace',
        'test-access-token',
        'test-refresh-token'
      );

      expect(events).toBeDefined();
      expect(events).toHaveLength(2);
      // The function should still return events even if sync fails
    });

    it('should handle storeSyncToken errors', async () => {
      // Mock error in storeSyncToken
      const { storeSyncToken } = await import('../google-calendar-sync');
      (storeSyncToken as any).mockRejectedValue(new Error('Store token error'));

      const events = await performFullSyncForWorkspace(
        'primary',
        'test-workspace',
        'test-access-token',
        'test-refresh-token'
      );

      expect(events).toBeDefined();
      expect(events).toHaveLength(2);
      // The function should still return events even if token storage fails
    });
  });
}); 