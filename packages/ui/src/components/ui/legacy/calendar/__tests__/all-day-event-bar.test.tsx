import React from 'react';
import { render } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { AllDayEventBar } from '../all-day-event-bar';
import * as calendarUtils from '../calendar-utils';
import { useCalendar } from '../../../../../hooks/use-calendar';
import { useCalendarSync } from '../../../../../hooks/use-calendar-sync';
import { useToast } from '../../../../../hooks/use-toast';

// Mock external dependencies
vi.mock('../../../../../hooks/use-calendar');
vi.mock('../../../../../hooks/use-calendar-sync');
vi.mock('../../../../../hooks/use-toast');
vi.mock('../calendar-utils');

describe('AllDayEventBar - Defensive Programming', () => {
  const mockUseCalendar = vi.mocked(useCalendar);
  const mockUseCalendarSync = vi.mocked(useCalendarSync);
  const mockUseToast = vi.mocked(useToast);
  const mockFindCalendarElements = vi.mocked(calendarUtils.findCalendarElements);

  const mockDates = [
    new Date('2024-01-15'),
    new Date('2024-01-16'),
    new Date('2024-01-17'),
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Setup minimal mocks to avoid type errors
    mockUseCalendar.mockReturnValue({
      settings: {
        appearance: { showWeekends: true },
        timezone: { timezone: 'UTC' },
      },
      openModal: vi.fn(),
      updateEvent: vi.fn(),
      crossZoneDragState: null,
      setCrossZoneDragState: vi.fn(),
    } as any);

    mockUseCalendarSync.mockReturnValue({
      allDayEvents: [],
    } as any);

    mockUseToast.mockReturnValue({
      toast: vi.fn(),
    } as any);

    // Setup DOM mocks
    mockFindCalendarElements.mockReturnValue({
      timeTrail: null,
      calendarView: null,
    });
  });

  describe('Component Rendering', () => {
    it('should render without crashing when DOM elements are missing', () => {
      mockFindCalendarElements.mockReturnValue({
        timeTrail: null,
        calendarView: null,
      });

      expect(() => {
        render(<AllDayEventBar dates={mockDates} />);
      }).not.toThrow();
    });

    it('should handle empty events array gracefully', () => {
      mockUseCalendarSync.mockReturnValue({
        allDayEvents: [],
      } as any);

      expect(() => {
        render(<AllDayEventBar dates={mockDates} />);
      }).not.toThrow();
    });

    it('should render with valid mock data', () => {
      const mockTimeTrail = document.createElement('div');
      mockTimeTrail.getBoundingClientRect = vi.fn().mockReturnValue({
        width: 64, height: 400, x: 0, y: 0, top: 0, left: 0, bottom: 400, right: 64, toJSON: () => ({})
      });

      const mockCalendarGrid = document.createElement('div');
      mockCalendarGrid.getBoundingClientRect = vi.fn().mockReturnValue({
        width: 800, height: 600, x: 0, y: 0, top: 0, left: 0, bottom: 600, right: 800, toJSON: () => ({})
      });

      mockFindCalendarElements.mockReturnValue({
        timeTrail: mockTimeTrail,
        calendarView: mockCalendarGrid,
      });

      expect(() => {
        render(<AllDayEventBar dates={mockDates} />);
      }).not.toThrow();
    });
  });

  describe('Error Resilience', () => {
    it('should handle findCalendarElements throwing errors', () => {
      mockFindCalendarElements.mockImplementation(() => {
        throw new Error('DOM access failed');
      });

      expect(() => {
        render(<AllDayEventBar dates={mockDates} />);
      }).not.toThrow();
    });

    it('should handle hook failures gracefully', () => {
      mockUseCalendar.mockImplementation(() => {
        throw new Error('Hook failed');
      });

      expect(() => {
        render(<AllDayEventBar dates={mockDates} />);
      }).toThrow(); // This is expected since hooks are critical
    });

    it('should handle invalid dates array', () => {
      const invalidDates = [null, undefined, 'invalid-date'] as any;

      expect(() => {
        render(<AllDayEventBar dates={invalidDates} />);
      }).not.toThrow();
    });
  });

  describe('DOM Validation', () => {
    it('should call findCalendarElements for DOM access', () => {
      render(<AllDayEventBar dates={mockDates} />);
      
      // Verify defensive DOM access is being used
      expect(mockFindCalendarElements).toHaveBeenCalled();
    });

    it('should handle missing calendar view container', () => {
      document.getElementById = vi.fn().mockReturnValue(null);
      
      mockFindCalendarElements.mockReturnValue({
        timeTrail: null,
        calendarView: null,
      });

      expect(() => {
        render(<AllDayEventBar dates={mockDates} />);
      }).not.toThrow();
    });
  });

  describe('Performance Considerations', () => {
    it('should not make excessive DOM queries', () => {
      render(<AllDayEventBar dates={mockDates} />);
      
      // Should not call findCalendarElements excessively during initial render
      expect(mockFindCalendarElements.mock.calls.length).toBeLessThan(10);
    });

    it('should handle large date arrays efficiently', () => {
      const largeDateArray = Array.from({ length: 100 }, (_, i) => 
        new Date(2024, 0, i + 1)
      );

      expect(() => {
        render(<AllDayEventBar dates={largeDateArray} />);
      }).not.toThrow();
    });
  });
}); 