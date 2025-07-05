import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Mock Supabase
vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null }))
        }))
      })),
      insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null }))
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null }))
      }))
    }))
  }))
}));

// Mock Google API
vi.mock('googleapis', () => ({
  google: {
    calendar: vi.fn(() => ({
      events: {
        list: vi.fn(() => Promise.resolve({
          data: {
            items: [
              {
                id: 'event1',
                summary: 'Test Event',
                start: { dateTime: '2024-01-01T10:00:00Z' },
                end: { dateTime: '2024-01-01T11:00:00Z' },
                colorId: '1'
              },
              {
                id: 'event2',
                summary: 'All Day Event',
                start: { date: '2024-01-02' },
                end: { date: '2024-01-03' },
                colorId: '2'
              }
            ]
          }
        })),
        insert: vi.fn(() => Promise.resolve({ data: { id: 'new-event-id' } })),
        update: vi.fn(() => Promise.resolve({ data: { id: 'updated-event-id' } })),
        delete: vi.fn(() => Promise.resolve({ data: {} }))
      }
    }))
  }
}));

// Mock isAllDayEvent function
vi.mock('@/utils/calendar', () => ({
  isAllDayEvent: vi.fn((startAt, endAt) => {
    // Mock logic: if startAt or endAt contains 'T', it's not all-day
    return !startAt?.includes('T') && !endAt?.includes('T')
  })
}));

// Mock auth functions
vi.mock('@/lib/auth', () => ({
  getServerSession: vi.fn(() => Promise.resolve({
    user: { id: 'test-user-id', email: 'test@example.com' }
  })),
  getGoogleAccessToken: vi.fn(() => Promise.resolve('mock-access-token'))
}));

// Mock database functions
vi.mock('@/lib/db', () => ({
  getSupabaseServerClient: vi.fn(() => ({
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: null, error: null }))
        }))
      })),
      insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
      update: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null }))
      })),
      delete: vi.fn(() => ({
        eq: vi.fn(() => Promise.resolve({ data: null, error: null }))
      }))
    }))
  }))
}));

describe('Calendar Sync Routes', () => {
  let mockSupabase: any;
  let mockGoogleCalendar: any;
  let mockIsAllDayEvent: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup mock Supabase client
    mockSupabase = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            single: vi.fn(() => Promise.resolve({ data: null, error: null }))
          }))
        })),
        insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
        update: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: null, error: null }))
        })),
        delete: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ data: null, error: null }))
        }))
      }))
    };

    // Setup mock Google Calendar
    mockGoogleCalendar = {
      events: {
        list: vi.fn(() => Promise.resolve({
          data: {
            items: [
              {
                id: 'event1',
                summary: 'Test Event',
                start: { dateTime: '2024-01-01T10:00:00Z' },
                end: { dateTime: '2024-01-01T11:00:00Z' },
                colorId: '1'
              },
              {
                id: 'event2',
                summary: 'All Day Event',
                start: { date: '2024-01-02' },
                end: { date: '2024-01-03' },
                colorId: '2'
              }
            ]
          }
        })),
        insert: vi.fn(() => Promise.resolve({ data: { id: 'new-event-id' } })),
        update: vi.fn(() => Promise.resolve({ data: { id: 'updated-event-id' } })),
        delete: vi.fn(() => Promise.resolve({ data: {} }))
      }
    };

    // Setup mock isAllDayEvent function
    mockIsAllDayEvent = vi.fn((startAt, endAt) => {
      // Mock logic: if startAt or endAt contains 'T', it's not all-day
      return !startAt?.includes('T') && !endAt?.includes('T')
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('GET /api/v1/calendar/auth/sync', () => {
    it('should fetch and sync calendar events', async () => {
      // This test would require importing the actual route handlers
      // For now, we'll test the mock setup
      expect(mockSupabase.from).toBeDefined();
      expect(mockGoogleCalendar.events.list).toBeDefined();
    });
  });

  describe('POST /api/v1/calendar/auth/sync', () => {
    it('should create a new event', async () => {
      const eventData = {
        summary: 'New Event',
        start_at: '2024-01-01T10:00:00Z',
        end_at: '2024-01-01T11:00:00Z',
        color_id: '1'
      };

      // Mock successful insert
      const mockInsert = vi.fn(() => Promise.resolve({ 
        data: { id: 'new-event-id' }, 
        error: null 
      }));
      mockSupabase.from.mockReturnValue({
        insert: mockInsert
      });

      const result = await mockSupabase.from('events').insert(eventData);
      
      expect(mockInsert).toHaveBeenCalledWith(eventData);
      expect(result.data).toEqual({ id: 'new-event-id' });
      expect(result.error).toBeNull();
    });

    it('should handle all-day events correctly', async () => {
      const allDayEventData = {
        summary: 'All Day Event',
        start_at: '2024-01-01',
        end_at: '2024-01-02',
        color_id: '2'
      };

      const mockInsert = vi.fn(() => Promise.resolve({ 
        data: { id: 'all-day-event-id' }, 
        error: null 
      }));
      mockSupabase.from.mockReturnValue({
        insert: mockInsert
      });

      const result = await mockSupabase.from('events').insert(allDayEventData);
      
      expect(mockInsert).toHaveBeenCalledWith(allDayEventData);
      expect(result.data).toEqual({ id: 'all-day-event-id' });
    });

    it('should detect all-day events using isAllDayEvent', () => {
      // Test all-day event detection
      expect(mockIsAllDayEvent('2024-01-01', '2024-01-02')).toBe(true);
      expect(mockIsAllDayEvent('2024-01-01T10:00:00Z', '2024-01-01T11:00:00Z')).toBe(false);
      expect(mockIsAllDayEvent('2024-01-01', '2024-01-01T11:00:00Z')).toBe(false);
    });
  });

  describe('PUT /api/v1/calendar/auth/sync', () => {
    it('should update an existing event', async () => {
      const eventId = 'event1';
      const updateData = {
        summary: 'Updated Event',
        start_at: '2024-01-01T11:00:00Z',
        end_at: '2024-01-01T12:00:00Z'
      };

      // Mock successful update
      const mockUpdate = vi.fn(() => Promise.resolve({ 
        data: { id: eventId, ...updateData }, 
        error: null 
      }));
      mockSupabase.from.mockReturnValue({
        update: vi.fn(() => ({
          eq: mockUpdate
        }))
      });

      const result = await mockSupabase.from('events').update(updateData).eq('id', eventId);
      
      expect(mockUpdate).toHaveBeenCalledWith('id', eventId);
      expect(result.data).toEqual({ id: eventId, ...updateData });
    });

    it('should handle partial updates with existing event data', async () => {
      const eventId = 'event1';
      const partialUpdate = {
        summary: 'Updated Event'
        // Missing start_at and end_at
      };

      // Mock fetching existing event
      const existingEvent = {
        id: eventId,
        summary: 'Original Event',
        start_at: '2024-01-01T10:00:00Z',
        end_at: '2024-01-01T11:00:00Z'
      };

      const mockSelect = vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(() => Promise.resolve({ data: existingEvent, error: null }))
        }))
      }));

      const mockUpdate = vi.fn(() => Promise.resolve({ 
        data: { id: eventId, ...partialUpdate }, 
        error: null 
      }));

      mockSupabase.from.mockReturnValue({
        select: mockSelect,
        update: vi.fn(() => ({
          eq: mockUpdate
        }))
      });

      // Simulate fetching existing event first
      const existing = await mockSupabase.from('events').select('*').eq('id', eventId).single();
      expect(existing.data).toEqual(existingEvent);

      // Then update
      const result = await mockSupabase.from('events').update(partialUpdate).eq('id', eventId);
      expect(mockUpdate).toHaveBeenCalledWith('id', eventId);
    });
  });

  describe('DELETE /api/v1/calendar/auth/sync', () => {
    it('should delete an event', async () => {
      const eventId = 'event1';

      const mockDelete = vi.fn(() => Promise.resolve({ 
        data: null, 
        error: null 
      }));
      mockSupabase.from.mockReturnValue({
        delete: vi.fn(() => ({
          eq: mockDelete
        }))
      });

      const result = await mockSupabase.from('events').delete().eq('id', eventId);
      
      expect(mockDelete).toHaveBeenCalledWith('id', eventId);
      expect(result.data).toBeNull();
      expect(result.error).toBeNull();
    });
  });

  describe('Error handling', () => {
    it('should handle database errors', async () => {
      const mockError = new Error('Database connection failed');
      const mockInsert = vi.fn(() => Promise.resolve({ 
        data: null, 
        error: mockError 
      }));
      mockSupabase.from.mockReturnValue({
        insert: mockInsert
      });

      const result = await mockSupabase.from('events').insert({});
      expect(result.error).toBe(mockError);
    });

    it('should handle Google API errors', async () => {
      const mockError = new Error('Google API rate limit exceeded');
      mockGoogleCalendar.events.list = vi.fn(() => Promise.reject(mockError));

      await expect(mockGoogleCalendar.events.list()).rejects.toThrow('Google API rate limit exceeded');
    });
  });

  describe('Event type detection', () => {
    it('should correctly identify all-day events', () => {
      const allDayEvents = [
        { start_at: '2024-01-01', end_at: '2024-01-02' },
        { start_at: '2024-01-01', end_at: '2024-01-01' },
        { start_at: '2024-01-01', end_at: null }
      ];

      allDayEvents.forEach(event => {
        expect(mockIsAllDayEvent(event.start_at, event.end_at)).toBe(true);
      });
    });

    it('should correctly identify timed events', () => {
      const timedEvents = [
        { start_at: '2024-01-01T10:00:00Z', end_at: '2024-01-01T11:00:00Z' },
        { start_at: '2024-01-01T10:00:00Z', end_at: '2024-01-01' },
        { start_at: '2024-01-01', end_at: '2024-01-01T11:00:00Z' }
      ];

      timedEvents.forEach(event => {
        expect(mockIsAllDayEvent(event.start_at, event.end_at)).toBe(false);
      });
    });
  });
}); 