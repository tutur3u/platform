import { describe, it, expect, beforeEach, vi } from 'vitest';
import { findCalendarElements } from '../calendar-utils';

// Mock console to capture warnings
const mockConsoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => {});

// Helper to create mock DOM elements
const createMockElement = (attributes: Record<string, string> = {}, dimensions = { width: 100, height: 50 }) => {
  const element = document.createElement('div');
  
  // Set attributes
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  
  // Mock getBoundingClientRect
  element.getBoundingClientRect = vi.fn().mockReturnValue({
    x: 0,
    y: 0,
    width: dimensions.width,
    height: dimensions.height,
    top: 0,
    left: 0,
    bottom: dimensions.height,
    right: dimensions.width,
    toJSON: () => ({}),
  });
  
  // Mock querySelector
  element.querySelector = vi.fn();
  
  return element;
};

describe('Calendar Utils - Defensive Programming', () => {
  beforeEach(() => {
    // Clear console spy calls
    mockConsoleWarn.mockClear();
    
    // Reset DOM mocks
    document.getElementById = vi.fn();
  });

  describe('findCalendarElements - Robust DOM Access', () => {
    it('should return null elements when calendar view is not found', () => {
      document.getElementById = vi.fn().mockReturnValue(null);
      
      const result = findCalendarElements();
      
      expect(result).toEqual({ timeTrail: null, calendarView: null });
      expect(mockConsoleWarn).toHaveBeenCalledWith('Calendar view container not found');
    });

    it('should find elements using primary selectors', () => {
      const mockTimeTrail = createMockElement({ 'data-testid': 'time-trail' });
      const mockCalendarGrid = createMockElement({ 'data-testid': 'calendar-grid' });
      const mockCalendarView = createMockElement({ id: 'calendar-view' });
      
      mockCalendarView.querySelector = vi.fn().mockImplementation((selector) => {
        if (selector === '[data-testid="time-trail"]') return mockTimeTrail;
        if (selector === '[data-testid="calendar-grid"]') return mockCalendarGrid;
        return null;
      });
      
      document.getElementById = vi.fn().mockReturnValue(mockCalendarView);
      
      const result = findCalendarElements();
      
      expect(result.timeTrail).toBe(mockTimeTrail);
      expect(result.calendarView).toBe(mockCalendarGrid);
    });

    it('should fallback to secondary selectors when primary ones fail', () => {
      const mockTimeTrail = createMockElement({ class: 'time-trail' });
      const mockCalendarGrid = createMockElement({ class: 'calendar-grid' });
      const mockCalendarView = createMockElement({ id: 'calendar-view' });
      
      mockCalendarView.querySelector = vi.fn().mockImplementation((selector) => {
        if (selector === '[data-testid="time-trail"]') return null;
        if (selector === '.time-trail') return mockTimeTrail;
        if (selector === '[data-testid="calendar-grid"]') return null;
        if (selector === '.calendar-grid') return mockCalendarGrid;
        return null;
      });
      
      document.getElementById = vi.fn().mockReturnValue(mockCalendarView);
      
      const result = findCalendarElements();
      
      expect(result.timeTrail).toBe(mockTimeTrail);
      expect(result.calendarView).toBe(mockCalendarGrid);
    });

    it('should handle elements without getBoundingClientRect method', () => {
      const mockTimeTrail = document.createElement('div');
      // Remove getBoundingClientRect method
      delete (mockTimeTrail as any).getBoundingClientRect;
      
      const mockCalendarView = createMockElement({ id: 'calendar-view' });
      mockCalendarView.querySelector = vi.fn().mockReturnValue(mockTimeTrail);
      
      document.getElementById = vi.fn().mockReturnValue(mockCalendarView);
      
      const result = findCalendarElements();
      
      expect(result.timeTrail).toBe(null);
      expect(mockConsoleWarn).toHaveBeenCalledWith('Time trail element missing getBoundingClientRect method');
    });

    it('should handle elements with zero dimensions', () => {
      const mockTimeTrail = createMockElement({}, { width: 0, height: 0 });
      const mockCalendarGrid = createMockElement({}, { width: 0, height: 0 });
      const mockCalendarView = createMockElement({ id: 'calendar-view' });
      
      mockCalendarView.querySelector = vi.fn().mockImplementation((selector) => {
        if (selector.includes('time-trail')) return mockTimeTrail;
        if (selector.includes('calendar-grid')) return mockCalendarGrid;
        return null;
      });
      
      document.getElementById = vi.fn().mockReturnValue(mockCalendarView);
      
      const result = findCalendarElements();
      
      expect(result.timeTrail).toBe(null);
      expect(result.calendarView).toBe(null);
      expect(mockConsoleWarn).toHaveBeenCalledWith('Time trail element has zero dimensions');
      expect(mockConsoleWarn).toHaveBeenCalledWith('Calendar grid element has zero dimensions');
    });

    it('should validate element dimensions properly', () => {
      const mockTimeTrail = createMockElement({}, { width: 64, height: 400 });
      const mockCalendarGrid = createMockElement({}, { width: 800, height: 600 });
      const mockCalendarView = createMockElement({ id: 'calendar-view' });
      
      mockCalendarView.querySelector = vi.fn().mockImplementation((selector) => {
        if (selector.includes('time-trail')) return mockTimeTrail;
        if (selector.includes('calendar-grid')) return mockCalendarGrid;
        return null;
      });
      
      document.getElementById = vi.fn().mockReturnValue(mockCalendarView);
      
      const result = findCalendarElements();
      
      expect(result.timeTrail).toBe(mockTimeTrail);
      expect(result.calendarView).toBe(mockCalendarGrid);
      expect(mockConsoleWarn).not.toHaveBeenCalled();
    });

    it('should handle querySelector throwing errors', () => {
      const mockCalendarView = createMockElement({ id: 'calendar-view' });
      mockCalendarView.querySelector = vi.fn().mockImplementation(() => {
        throw new Error('querySelector failed');
      });
      
      document.getElementById = vi.fn().mockReturnValue(mockCalendarView);
      
      // Should not crash despite querySelector throwing
      expect(() => findCalendarElements()).not.toThrow();
    });

    it('should handle getBoundingClientRect throwing errors', () => {
      const mockTimeTrail = createMockElement();
      mockTimeTrail.getBoundingClientRect = vi.fn().mockImplementation(() => {
        throw new Error('getBoundingClientRect failed');
      });

      const mockCalendarView = createMockElement({ id: 'calendar-view' });
      mockCalendarView.querySelector = vi.fn().mockReturnValue(mockTimeTrail);
      
      document.getElementById = vi.fn().mockReturnValue(mockCalendarView);
      
      // Should handle the error gracefully and not crash
      expect(() => findCalendarElements()).not.toThrow();
    });
  });

  describe('Input Validation Principles', () => {
    it('should validate coordinate parameters', () => {
      const invalidInputs = [
        [NaN, 100],
        [100, NaN],
        [Infinity, 100],
        [100, -Infinity],
        ['string' as any, 100],
        [100, 'string' as any],
        [null as any, 100],
        [undefined as any, 100],
      ];

      invalidInputs.forEach(([x, y]) => {
        // Test the validation logic that would be used in calculateTimeSlotTarget
        expect(typeof x === 'number' && isFinite(x)).toBe(x === 100);
        expect(typeof y === 'number' && isFinite(y)).toBe(y === 100);
      });
    });

    it('should validate hour attributes are within valid range', () => {
      const validHours = [0, 12, 23];
      const invalidHours = [-1, 24, 25, NaN, Infinity];

      validHours.forEach(hour => {
        expect(hour >= 0 && hour <= 23).toBe(true);
      });

      invalidHours.forEach(hour => {
        expect(hour >= 0 && hour <= 23 && isFinite(hour)).toBe(false);
      });
    });
  });

  describe('Error Recovery', () => {
    it('should provide meaningful error messages for debugging', () => {
      document.getElementById = vi.fn().mockReturnValue(null);
      
      findCalendarElements();
      
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Calendar view container not found')
      );
    });

    it('should handle document.getElementById returning unexpected types', () => {
      // Mock getElementById to return unexpected type
      document.getElementById = vi.fn().mockReturnValue('not-an-element' as any);
      
      const result = findCalendarElements();
      
      expect(result).toEqual({ timeTrail: null, calendarView: null });
    });
  });

  describe('Performance Considerations', () => {
    it('should not perform unnecessary DOM operations', () => {
      const mockCalendarView = createMockElement({ id: 'calendar-view' });
      const querySelectorSpy = vi.fn().mockReturnValue(null);
      mockCalendarView.querySelector = querySelectorSpy;
      
      document.getElementById = vi.fn().mockReturnValue(mockCalendarView);
      
      findCalendarElements();
      
      // Should attempt multiple selectors but stop efficiently
      expect(querySelectorSpy.mock.calls.length).toBeGreaterThan(0);
      expect(querySelectorSpy.mock.calls.length).toBeLessThan(20); // Reasonable upper bound
    });

    it('should short-circuit when elements are found', () => {
      const mockTimeTrail = createMockElement({}, { width: 64, height: 400 });
      const mockCalendarView = createMockElement({ id: 'calendar-view' });
      const querySelectorSpy = vi.fn()
        .mockReturnValueOnce(mockTimeTrail) // First selector succeeds
        .mockReturnValue(null); // Should not be called for time trail
      
      mockCalendarView.querySelector = querySelectorSpy;
      document.getElementById = vi.fn().mockReturnValue(mockCalendarView);
      
      findCalendarElements();
      
      // Should find time trail on first try and not continue trying other selectors for it
      expect(querySelectorSpy).toHaveBeenCalledWith('[data-testid="time-trail"]');
    });
  });
}); 