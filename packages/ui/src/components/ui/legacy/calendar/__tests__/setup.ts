import { vi } from 'vitest';

// Mock global objects and APIs that the calendar components depend on
global.ResizeObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

global.IntersectionObserver = vi.fn().mockImplementation(() => ({
  observe: vi.fn(),
  unobserve: vi.fn(),
  disconnect: vi.fn(),
}));

// Mock requestAnimationFrame and cancelAnimationFrame
global.requestAnimationFrame = vi.fn().mockImplementation((cb) => {
  return setTimeout(cb, 16); // ~60fps
});

global.cancelAnimationFrame = vi.fn().mockImplementation((id) => {
  clearTimeout(id);
});

// Mock setTimeout and clearTimeout for auto-scroll functionality
global.setTimeout = vi.fn().mockImplementation((fn, delay) => {
  if (typeof fn === 'function') {
    return setTimeout(fn, delay) as any;
  }
  return 0;
}) as any;

global.clearTimeout = vi.fn() as any;

// Mock console methods to avoid cluttering test output
const originalConsole = { ...console };
global.console = {
  ...originalConsole,
  log: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
};

// Mock window methods used by drag and drop
Object.defineProperty(window, 'getComputedStyle', {
  value: vi.fn().mockImplementation(() => ({
    overflowY: 'auto',
    getPropertyValue: vi.fn(),
  })),
});

// Mock HTMLElement methods
HTMLElement.prototype.getBoundingClientRect = vi.fn().mockReturnValue({
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  top: 0,
  left: 0,
  bottom: 50,
  right: 100,
  toJSON: () => ({}),
});

HTMLElement.prototype.scrollTo = vi.fn();
HTMLElement.prototype.querySelector = vi.fn();
HTMLElement.prototype.querySelectorAll = vi.fn();

// Mock drag and drop APIs
(global as any).DragEvent = class MockDragEvent extends Event {
  dataTransfer: any;
  constructor(type: string, eventInitDict?: any) {
    super(type, eventInitDict);
    this.dataTransfer = {
      setData: vi.fn(),
      getData: vi.fn(),
      files: [],
    };
  }
};

// Mock pointer events
(global as any).PointerEvent = class MockPointerEvent extends MouseEvent {
  pointerId: number;
  constructor(type: string, eventInitDict?: any) {
    super(type, eventInitDict);
    this.pointerId = eventInitDict?.pointerId ?? 1;
  }
};

// Setup cleanup function for tests
export const cleanup = () => {
  vi.clearAllMocks();
  vi.clearAllTimers();
  
  // Reset console
  global.console = originalConsole;
  
  // Clear DOM
  document.body.innerHTML = '';
  document.head.innerHTML = '';
};

// Export useful test utilities
export const createMockMouseEvent = (type: string, options: Partial<MouseEvent> = {}) => {
  return new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: 100,
    clientY: 100,
    ...options,
  });
};

export const createMockRect = (overrides: Partial<DOMRect> = {}): DOMRect => ({
  x: 0,
  y: 0,
  width: 100,
  height: 50,
  top: 0,
  left: 0,
  bottom: 50,
  right: 100,
  toJSON: () => ({}),
  ...overrides,
});

export const mockCalendarElement = (attributes: Record<string, string> = {}) => {
  const element = document.createElement('div');
  Object.entries(attributes).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  
  element.getBoundingClientRect = vi.fn().mockReturnValue(createMockRect());
  element.querySelector = vi.fn();
  element.querySelectorAll = vi.fn();
  
  return element;
};

// Mock implementation for findCalendarElements utility
export const mockFindCalendarElements = (options: {
  hasTimeTrail?: boolean;
  hasCalendarView?: boolean;
  timeTrailDimensions?: Partial<DOMRect>;
  calendarViewDimensions?: Partial<DOMRect>;
} = {}) => {
  const {
    hasTimeTrail = true,
    hasCalendarView = true,
    timeTrailDimensions = {},
    calendarViewDimensions = {},
  } = options;

  return {
    timeTrail: hasTimeTrail ? {
      ...mockCalendarElement({ 'data-testid': 'time-trail' }),
      getBoundingClientRect: () => createMockRect({ width: 64, height: 400, ...timeTrailDimensions }),
    } : null,
    calendarView: hasCalendarView ? {
      ...mockCalendarElement({ 'data-testid': 'calendar-grid' }),
      getBoundingClientRect: () => createMockRect({ width: 800, height: 600, ...calendarViewDimensions }),
    } : null,
  };
}; 