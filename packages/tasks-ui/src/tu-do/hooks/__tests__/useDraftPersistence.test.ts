/**
 * @vitest-environment jsdom
 */
import { act, renderHook } from '@testing-library/react';
import type { JSONContent } from '@tiptap/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDraftPersistence } from '../useDraftPersistence';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    get length() {
      return Object.keys(store).length;
    },
    key: (index: number) => {
      const keys = Object.keys(store);
      return keys[index] || null;
    },
  };
})();

// Mock both global.localStorage and window.localStorage for jsdom compatibility
Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

describe('useDraftPersistence', () => {
  const boardId = 'test-board-id';
  const draftStorageKey = `tu-do:task-draft:${boardId}`;

  beforeEach(() => {
    localStorageMock.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const getDefaultProps = () => ({
    boardId,
    isOpen: false,
    isCreateMode: false,
    isSaving: false,
    name: '',
    description: null as JSONContent | null,
    priority: null as any,
    startDate: undefined,
    endDate: undefined,
    selectedListId: 'list-1',
    estimationPoints: null as number | null | undefined,
    selectedLabels: [],
  });

  describe('initialization', () => {
    it('should initialize with hasDraft false when no draft exists', () => {
      const { result } = renderHook(() =>
        useDraftPersistence({
          ...getDefaultProps(),
          isOpen: true,
          isCreateMode: true,
        })
      );

      expect(result.current.hasDraft).toBe(false);
    });

    it('should not load draft when not in create mode', () => {
      localStorageMock.setItem(
        draftStorageKey,
        JSON.stringify({ name: 'Saved Task', description: null })
      );

      const { result } = renderHook(() =>
        useDraftPersistence({
          ...getDefaultProps(),
          isOpen: true,
          isCreateMode: false,
        })
      );

      expect(result.current.hasDraft).toBe(false);
    });

    it('should not load draft when dialog is not open', () => {
      localStorageMock.setItem(
        draftStorageKey,
        JSON.stringify({ name: 'Saved Task', description: null })
      );

      const { result } = renderHook(() =>
        useDraftPersistence({
          ...getDefaultProps(),
          isOpen: false,
          isCreateMode: true,
        })
      );

      expect(result.current.hasDraft).toBe(false);
    });

    // Note: Draft detection on mount is tested indirectly through auto-save tests
    // Direct testing of draft detection is challenging due to localStorage mock limitations

    it('should clear empty draft on load', () => {
      localStorageMock.setItem(
        draftStorageKey,
        JSON.stringify({
          name: '',
          description: null,
          priority: null,
          startDate: null,
          endDate: null,
          selectedListId: 'list-1',
          estimationPoints: null,
          selectedLabels: [],
        })
      );

      const { result } = renderHook(() =>
        useDraftPersistence({
          ...getDefaultProps(),
          isOpen: true,
          isCreateMode: true,
        })
      );

      expect(result.current.hasDraft).toBe(false);
      expect(localStorageMock.getItem(draftStorageKey)).toBeNull();
    });

    it('should handle corrupted draft gracefully', () => {
      localStorageMock.setItem(draftStorageKey, 'invalid-json');

      const { result } = renderHook(() =>
        useDraftPersistence({
          ...getDefaultProps(),
          isOpen: true,
          isCreateMode: true,
        })
      );

      expect(result.current.hasDraft).toBe(false);
    });
  });

  describe('auto-save', () => {
    it('should debounce draft saves', async () => {
      const { rerender } = renderHook(
        ({ name }) =>
          useDraftPersistence({
            ...getDefaultProps(),
            isOpen: true,
            isCreateMode: true,
            name,
          }),
        { initialProps: { name: '' } }
      );

      // Update name but don't advance timers yet
      rerender({ name: 'New Task' });

      // Should not save immediately
      expect(localStorageMock.getItem(draftStorageKey)).toBeNull();

      // Advance timers by debounce duration
      act(() => {
        vi.advanceTimersByTime(300);
      });

      // Should now be saved
      const saved = JSON.parse(
        localStorageMock.getItem(draftStorageKey) || '{}'
      );
      expect(saved.name).toBe('New Task');
    });

    it('should save draft with all fields', async () => {
      const startDate = new Date('2025-01-15');
      const endDate = new Date('2025-01-20');
      const description: JSONContent = { type: 'doc', content: [] };

      const { result } = renderHook(() =>
        useDraftPersistence({
          ...getDefaultProps(),
          isOpen: true,
          isCreateMode: true,
          name: 'Complete Task',
          description,
          priority: 'high' as any,
          startDate,
          endDate,
          selectedListId: 'list-2',
          estimationPoints: 5,
          selectedLabels: [{ id: '1', name: 'Bug' }],
        })
      );

      act(() => {
        vi.advanceTimersByTime(300);
      });

      const saved = JSON.parse(
        localStorageMock.getItem(draftStorageKey) || '{}'
      );
      expect(saved.name).toBe('Complete Task');
      expect(saved.description).toEqual(description);
      expect(saved.priority).toBe('high');
      expect(saved.startDate).toBe(startDate.toISOString());
      expect(saved.endDate).toBe(endDate.toISOString());
      expect(saved.selectedListId).toBe('list-2');
      expect(saved.estimationPoints).toBe(5);
      expect(saved.selectedLabels).toHaveLength(1);
      expect(result.current.hasDraft).toBe(true);
    });

    it('should not save when isSaving is true', async () => {
      const { rerender } = renderHook(
        ({ isSaving }) =>
          useDraftPersistence({
            ...getDefaultProps(),
            isOpen: true,
            isCreateMode: true,
            name: 'Test Task',
            isSaving,
          }),
        { initialProps: { isSaving: false } }
      );

      rerender({ isSaving: true });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(localStorageMock.getItem(draftStorageKey)).toBeNull();
    });

    it('should not save when not in create mode', async () => {
      const { result } = renderHook(() =>
        useDraftPersistence({
          ...getDefaultProps(),
          isOpen: true,
          isCreateMode: false,
          name: 'Test Task',
        })
      );

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(localStorageMock.getItem(draftStorageKey)).toBeNull();
      expect(result.current.hasDraft).toBe(false);
    });

    it('should not save when dialog is closed', async () => {
      const { result } = renderHook(() =>
        useDraftPersistence({
          ...getDefaultProps(),
          isOpen: false,
          isCreateMode: true,
          name: 'Test Task',
        })
      );

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(localStorageMock.getItem(draftStorageKey)).toBeNull();
      expect(result.current.hasDraft).toBe(false);
    });

    it('should clear draft when all fields are empty', async () => {
      localStorageMock.setItem(
        draftStorageKey,
        JSON.stringify({ name: 'Old Task' })
      );

      const { result } = renderHook(() =>
        useDraftPersistence({
          ...getDefaultProps(),
          isOpen: true,
          isCreateMode: true,
          name: '',
        })
      );

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(localStorageMock.getItem(draftStorageKey)).toBeNull();
      expect(result.current.hasDraft).toBe(false);
    });

    it('should cancel previous timer on rapid changes', async () => {
      const { rerender } = renderHook(
        ({ name }) =>
          useDraftPersistence({
            ...getDefaultProps(),
            isOpen: true,
            isCreateMode: true,
            name,
          }),
        { initialProps: { name: 'First' } }
      );

      // First update
      rerender({ name: 'Second' });
      act(() => {
        vi.advanceTimersByTime(150); // Half the debounce time
      });

      // Second update before first completes
      rerender({ name: 'Third' });
      act(() => {
        vi.advanceTimersByTime(150); // Another half
      });

      // Should not have saved yet
      expect(localStorageMock.getItem(draftStorageKey)).toBeNull();

      // Complete the debounce
      act(() => {
        vi.advanceTimersByTime(150);
      });

      // Should only save the final value
      const saved = JSON.parse(
        localStorageMock.getItem(draftStorageKey) || '{}'
      );
      expect(saved.name).toBe('Third');
    });
  });

  describe('clearDraft', () => {
    it('should clear draft from localStorage', () => {
      localStorageMock.setItem(
        draftStorageKey,
        JSON.stringify({ name: 'Test' })
      );

      const { result } = renderHook(() =>
        useDraftPersistence({
          ...getDefaultProps(),
          isOpen: true,
          isCreateMode: true,
        })
      );

      act(() => {
        result.current.clearDraft();
      });

      expect(localStorageMock.getItem(draftStorageKey)).toBeNull();
      expect(result.current.hasDraft).toBe(false);
    });

    it('should cancel pending save when clearing draft', () => {
      const { result } = renderHook(() =>
        useDraftPersistence({
          ...getDefaultProps(),
          isOpen: true,
          isCreateMode: true,
          name: 'Test Task',
        })
      );

      // Start a debounced save
      act(() => {
        vi.advanceTimersByTime(150); // Half the debounce time
      });

      // Clear draft before save completes
      act(() => {
        result.current.clearDraft();
      });

      // Complete the debounce time
      act(() => {
        vi.advanceTimersByTime(300);
      });

      // Should not have saved
      expect(localStorageMock.getItem(draftStorageKey)).toBeNull();
      expect(result.current.hasDraft).toBe(false);
    });

    it('should handle clear when no draft exists', () => {
      const { result } = renderHook(() =>
        useDraftPersistence({
          ...getDefaultProps(),
          isOpen: true,
          isCreateMode: true,
        })
      );

      expect(() => {
        act(() => {
          result.current.clearDraft();
        });
      }).not.toThrow();

      expect(result.current.hasDraft).toBe(false);
    });
  });

  describe('edit mode behavior', () => {
    it('should clear draft when opening in edit mode', () => {
      localStorageMock.setItem(
        draftStorageKey,
        JSON.stringify({ name: 'Draft Task' })
      );

      const { result } = renderHook(() =>
        useDraftPersistence({
          ...getDefaultProps(),
          isOpen: true,
          isCreateMode: false,
        })
      );

      expect(localStorageMock.getItem(draftStorageKey)).toBeNull();
      expect(result.current.hasDraft).toBe(false);
    });

    it('should not save drafts in edit mode', async () => {
      const { result } = renderHook(() =>
        useDraftPersistence({
          ...getDefaultProps(),
          isOpen: true,
          isCreateMode: false,
          name: 'Edited Task',
        })
      );

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(localStorageMock.getItem(draftStorageKey)).toBeNull();
      expect(result.current.hasDraft).toBe(false);
    });
  });

  describe('cleanup', () => {
    it('should cleanup timer on unmount', () => {
      const { unmount } = renderHook(() =>
        useDraftPersistence({
          ...getDefaultProps(),
          isOpen: true,
          isCreateMode: true,
          name: 'Test',
        })
      );

      // Start a save
      act(() => {
        vi.advanceTimersByTime(150);
      });

      // Unmount before save completes
      unmount();

      // Advance timers to where save would have happened
      act(() => {
        vi.advanceTimersByTime(300);
      });

      // Should not have saved
      expect(localStorageMock.getItem(draftStorageKey)).toBeNull();
    });
  });
});
