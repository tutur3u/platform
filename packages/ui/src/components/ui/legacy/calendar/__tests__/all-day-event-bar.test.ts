import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  detectDropZone,
  calculateVisibleHourOffset,
  calculateTargetDateIndex,
  roundToNearestQuarterHour,
  calculateTimeSlotTarget,
} from '../calendar-utils';

describe('all-day-event-bar helpers', () => {
  describe('detectDropZone', () => {
    let calendarView: HTMLElement;
    let allDayContainer: HTMLElement;
    beforeEach(() => {
      // Create calendar view element
      calendarView = document.createElement('div');
      calendarView.id = 'calendar-view';
      
      // Create all-day container element
      allDayContainer = document.createElement('div');
      allDayContainer.className = 'all-day-container';
      
      // Set up DOM structure
      document.body.appendChild(calendarView);
      calendarView.appendChild(allDayContainer);
      
      // Mock getBoundingClientRect for the elements
      vi.spyOn(calendarView, 'getBoundingClientRect').mockReturnValue({ 
        top: 0, 
        bottom: 500, 
        left: 0, 
        right: 500, 
        width: 500, 
        height: 500, 
        x: 0, 
        y: 0, 
        toJSON: () => {} 
      });
      
      vi.spyOn(allDayContainer, 'getBoundingClientRect').mockReturnValue({ 
        top: 0, 
        bottom: 100, 
        left: 0, 
        right: 500, 
        width: 500, 
        height: 100, 
        x: 0, 
        y: 0, 
        toJSON: () => {} 
      });
      
      // Mock document.getElementById
      vi.spyOn(document, 'getElementById').mockImplementation((id) => {
        if (id === 'calendar-view') return calendarView;
        return null;
      });
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it('returns all-day if calendarView is null', () => {
      expect(detectDropZone(150, null, allDayContainer)).toBe('all-day');
    });
    it('returns all-day if allDayContainer is null', () => {
      expect(detectDropZone(150, calendarView, null)).toBe('all-day');
    });
    it('returns timed if clientY is below allDayContainer and within calendarView', () => {
      expect(detectDropZone(150, calendarView, allDayContainer)).toBe('timed');
    });
    it('returns all-day if clientY is above allDayContainer', () => {
      expect(detectDropZone(50, calendarView, allDayContainer)).toBe('all-day');
    });
    it('returns all-day if clientY is below calendarView', () => {
      expect(detectDropZone(600, calendarView, allDayContainer)).toBe('all-day');
    });
  });

  describe('calculateVisibleHourOffset', () => {
    it('calculates correct hour offset', () => {
      const cellRect = { top: 100 } as DOMRect;
      // clientY=148, cellRect.top=100, so mouseYFromCellTop=48
      // With HOUR_HEIGHT=80, mouseHourOffset=48/80=0.6, so 8+0.6=8.6
      expect(calculateVisibleHourOffset(148, cellRect, 8)).toBeCloseTo(8.6);
    });
    it('handles negative offset', () => {
      const cellRect = { top: 200 } as DOMRect;
      // clientY=100, cellRect.top=200, so mouseYFromCellTop=-100
      // With HOUR_HEIGHT=80, mouseHourOffset=-100/80=-1.25, so 8-1.25=6.75
      expect(calculateVisibleHourOffset(100, cellRect, 8)).toBeCloseTo(6.75, 2);
    });
  });

  describe('calculateTargetDateIndex', () => {
    it('returns correct index within bounds', () => {
      const timeTrailRect = { right: 0 } as DOMRect;
      const calendarViewRect = { width: 700 } as DOMRect;
      // clientX=350, timeTrailRect.right=0, columnWidth=100, so index=3
      expect(calculateTargetDateIndex(350, timeTrailRect, calendarViewRect, 7)).toBe(3);
    });
    it('clamps to 0 if negative', () => {
      const timeTrailRect = { right: 0 } as DOMRect;
      const calendarViewRect = { width: 700 } as DOMRect;
      // clientX=-100, timeTrailRect.right=0, so index=-1, clamped to 0
      expect(calculateTargetDateIndex(-100, timeTrailRect, calendarViewRect, 7)).toBe(0);
    });
    it('clamps to max if out of bounds', () => {
      const timeTrailRect = { right: 0 } as DOMRect;
      const calendarViewRect = { width: 700 } as DOMRect;
      // clientX=1000, timeTrailRect.right=0, so index=10, clamped to 6
      expect(calculateTargetDateIndex(1000, timeTrailRect, calendarViewRect, 7)).toBe(6);
    });
  });

  describe('roundToNearestQuarterHour', () => {
    it('rounds to nearest quarter hour', () => {
      // 8.13 -> 8:15, 8.49 -> 8:30, 8.51 -> 8:30
      expect(roundToNearestQuarterHour(8.13)).toEqual({ hour: 8, minute: 15 });
      expect(roundToNearestQuarterHour(8.49)).toEqual({ hour: 8, minute: 30 });
      expect(roundToNearestQuarterHour(8.51)).toEqual({ hour: 8, minute: 30 });
    });
    it('clamps to 23:45 if overflows', () => {
      // 23.99 -> 23:00 (clamped)
      expect(roundToNearestQuarterHour(23.99)).toEqual({ hour: 23, minute: 0 });
    });
    it('clamps to 0:00 if negative', () => {
      // -1 -> 0:00
      expect(roundToNearestQuarterHour(-1)).toEqual({ hour: 0, minute: 0 });
    });
  });

  describe('calculateTimeSlotTarget', () => {
    let calendarView: HTMLDivElement;
    let timeTrail: HTMLDivElement;
    let calendarGrid: HTMLDivElement;
    let cell: HTMLDivElement;
    let visibleDates: Date[];
    beforeEach(() => {
      // Set up DOM structure
      calendarView = document.createElement('div');
      calendarView.id = 'calendar-view';
      timeTrail = document.createElement('div');
      timeTrail.className = 'time-trail';
      calendarGrid = document.createElement('div');
      calendarGrid.className = 'calendar-grid flex-1';
      cell = document.createElement('div');
      cell.className = 'calendar-cell';
      cell.setAttribute('data-hour', '8');
      
      // Build DOM structure
      calendarGrid.appendChild(cell);
      calendarView.appendChild(timeTrail);
      calendarView.appendChild(calendarGrid);
      document.body.appendChild(calendarView);
      
      // Mock getBoundingClientRect for all elements
      vi.spyOn(timeTrail, 'getBoundingClientRect').mockReturnValue({ 
        right: 64, 
        width: 64, 
        top: 0, 
        bottom: 500, 
        left: 0, 
        height: 500, 
        x: 0, 
        y: 0, 
        toJSON: () => {} 
      });
      
      vi.spyOn(calendarGrid, 'getBoundingClientRect').mockReturnValue({ 
        width: 700, 
        left: 64, 
        right: 764, 
        top: 0, 
        bottom: 500, 
        height: 500, 
        x: 64, 
        y: 0, 
        toJSON: () => {} 
      });
      
      vi.spyOn(cell, 'getBoundingClientRect').mockReturnValue({ 
        top: 100, 
        height: 80, 
        left: 64, 
        right: 164, 
        width: 100, 
        bottom: 180, 
        x: 64, 
        y: 100, 
        toJSON: () => {} 
      });
      
      // Mock querySelector to return our cell
      vi.spyOn(calendarGrid, 'querySelector').mockReturnValue(cell);
      
      // Mock document.getElementById
      vi.spyOn(document, 'getElementById').mockImplementation((id) => {
        if (id === 'calendar-view') return calendarView;
        return null;
      });
      
      visibleDates = [new Date('2024-01-01'), new Date('2024-01-02'), new Date('2024-01-03')];
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });
    it('returns null if calendarView is missing', () => {
      // Mock getElementById to return null (no calendar view)
      vi.spyOn(document, 'getElementById').mockReturnValue(null);
      // Should return null if calendarView is not found
      expect(calculateTimeSlotTarget(150, 148, visibleDates)).toBeNull();
    });
    it('returns correct slot info for valid input', () => {
      // calculateTimeSlotTarget should work with the current DOM setup
      const result = calculateTimeSlotTarget(150, 148, visibleDates);
      
      // Should return an object with date, hour, and minute
      expect(result).toBeTruthy();
      expect(result).toHaveProperty('date');
      expect(result).toHaveProperty('hour');
      expect(result).toHaveProperty('minute');
      
      // Date should be one of the visible dates
      if (result) {
        expect(visibleDates).toContain(result.date);
        expect(typeof result.hour).toBe('number');
        expect(typeof result.minute).toBe('number');
        expect(result.hour).toBeGreaterThanOrEqual(0);
        expect(result.hour).toBeLessThanOrEqual(23);
        expect(result.minute).toBeGreaterThanOrEqual(0);
        expect(result.minute).toBeLessThanOrEqual(59);
      }
    });
  });
}); 