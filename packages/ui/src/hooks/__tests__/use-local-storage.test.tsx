import { renderHook, act } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useLocalStorage } from '../use-local-storage';

describe('useLocalStorage', () => {
  const TEST_KEY = 'test-key';

  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('initial state', () => {
    it('should return initial value when localStorage is empty', () => {
      const initialValue = 'initial';
      const { result } = renderHook(() =>
        useLocalStorage(TEST_KEY, initialValue)
      );

      expect(result.current[0]).toBe(initialValue);
    });

    it('should return stored value when localStorage has data', () => {
      const storedValue = 'stored';
      window.localStorage.setItem(TEST_KEY, JSON.stringify(storedValue));

      const { result } = renderHook(() => useLocalStorage(TEST_KEY, 'initial'));

      // Wait for useEffect to run
      expect(result.current[0]).toBe(storedValue);
    });

    it('should work with object initial values', () => {
      const initialValue = { name: 'test', count: 0 };
      const { result } = renderHook(() =>
        useLocalStorage(TEST_KEY, initialValue)
      );

      expect(result.current[0]).toEqual(initialValue);
    });

    it('should work with array initial values', () => {
      const initialValue = [1, 2, 3];
      const { result } = renderHook(() =>
        useLocalStorage(TEST_KEY, initialValue)
      );

      expect(result.current[0]).toEqual(initialValue);
    });

    it('should work with null initial values', () => {
      const { result } = renderHook(() =>
        useLocalStorage<string | null>(TEST_KEY, null)
      );

      expect(result.current[0]).toBeNull();
    });

    it('should work with boolean initial values', () => {
      const { result } = renderHook(() => useLocalStorage(TEST_KEY, true));

      expect(result.current[0]).toBe(true);
    });

    it('should work with number initial values', () => {
      const { result } = renderHook(() => useLocalStorage(TEST_KEY, 42));

      expect(result.current[0]).toBe(42);
    });
  });

  describe('setValue', () => {
    it('should update value and localStorage with direct value', () => {
      const { result } = renderHook(() => useLocalStorage(TEST_KEY, 'initial'));

      act(() => {
        result.current[1]('updated');
      });

      expect(result.current[0]).toBe('updated');
      expect(JSON.parse(window.localStorage.getItem(TEST_KEY) ?? '')).toBe(
        'updated'
      );
    });

    it('should update value with function updater', () => {
      const { result } = renderHook(() => useLocalStorage(TEST_KEY, 10));

      act(() => {
        result.current[1]((prev) => prev + 5);
      });

      expect(result.current[0]).toBe(15);
    });

    it('should update objects correctly', () => {
      const { result } = renderHook(() =>
        useLocalStorage(TEST_KEY, { count: 0 })
      );

      act(() => {
        result.current[1]({ count: 5 });
      });

      expect(result.current[0]).toEqual({ count: 5 });
      expect(JSON.parse(window.localStorage.getItem(TEST_KEY) ?? '')).toEqual({
        count: 5,
      });
    });

    it('should update arrays correctly', () => {
      const { result } = renderHook(() =>
        useLocalStorage<number[]>(TEST_KEY, [])
      );

      act(() => {
        result.current[1]((prev) => [...prev, 1, 2, 3]);
      });

      expect(result.current[0]).toEqual([1, 2, 3]);
    });
  });

  describe('key changes', () => {
    it('should read from new key when key changes', () => {
      const KEY1 = 'key1';
      const KEY2 = 'key2';

      window.localStorage.setItem(KEY1, JSON.stringify('value1'));
      window.localStorage.setItem(KEY2, JSON.stringify('value2'));

      const { result, rerender } = renderHook(
        ({ key }) => useLocalStorage(key, 'default'),
        { initialProps: { key: KEY1 } }
      );

      expect(result.current[0]).toBe('value1');

      rerender({ key: KEY2 });

      expect(result.current[0]).toBe('value2');
    });
  });

  describe('error handling', () => {
    it('should handle invalid JSON in localStorage gracefully', () => {
      window.localStorage.setItem(TEST_KEY, 'invalid-json');

      const { result } = renderHook(() => useLocalStorage(TEST_KEY, 'initial'));

      // Should return initial value when JSON parsing fails
      expect(result.current[0]).toBe('initial');
      expect(console.error).toHaveBeenCalled();
    });

    it('should handle localStorage setItem errors', () => {
      const mockSetItem = vi.spyOn(Storage.prototype, 'setItem');
      mockSetItem.mockImplementation(() => {
        throw new Error('Storage quota exceeded');
      });

      const { result } = renderHook(() => useLocalStorage(TEST_KEY, 'initial'));

      act(() => {
        result.current[1]('new-value');
      });

      // Value should still update in state even if localStorage fails
      expect(result.current[0]).toBe('new-value');
      expect(console.error).toHaveBeenCalled();

      mockSetItem.mockRestore();
    });
  });

  describe('multiple hooks with same key', () => {
    it('should share the same storage key', () => {
      const { result: result1 } = renderHook(() =>
        useLocalStorage(TEST_KEY, 'initial')
      );

      // Create second hook instance to verify they share storage
      renderHook(() => useLocalStorage(TEST_KEY, 'initial'));

      act(() => {
        result1.current[1]('updated');
      });

      // Both hooks share the same localStorage key
      // localStorage should be updated
      expect(JSON.parse(window.localStorage.getItem(TEST_KEY) ?? '')).toBe(
        'updated'
      );
    });
  });

  describe('complex scenarios', () => {
    it('should handle nested objects', () => {
      const initialValue = {
        user: {
          name: 'John',
          preferences: {
            theme: 'dark',
            notifications: true,
          },
        },
      };

      const { result } = renderHook(() =>
        useLocalStorage(TEST_KEY, initialValue)
      );

      act(() => {
        result.current[1]((prev) => ({
          ...prev,
          user: {
            ...prev.user,
            preferences: {
              ...prev.user.preferences,
              theme: 'light',
            },
          },
        }));
      });

      expect(result.current[0].user.preferences.theme).toBe('light');
      expect(result.current[0].user.preferences.notifications).toBe(true);
    });

    it('should handle Date objects (serialized as strings)', () => {
      const date = new Date('2024-01-01T00:00:00.000Z');
      const { result } = renderHook(() =>
        useLocalStorage(TEST_KEY, date.toISOString())
      );

      expect(result.current[0]).toBe('2024-01-01T00:00:00.000Z');
    });
  });
});
