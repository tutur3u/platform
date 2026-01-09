import type React from 'react';
import { useCallback, useEffect, useState } from 'react';

export const useLocalStorage = <T>(
  key: string,
  initialValue: T
): [T, React.Dispatch<React.SetStateAction<T>>, boolean] => {
  const [storedValue, setStoredValue] = useState<T>(initialValue);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    // Retrieve from localStorage
    const item = window.localStorage.getItem(key);
    if (item) {
      try {
        setStoredValue(JSON.parse(item));
      } catch (error) {
        console.error(error);
      }
    }
    setInitialized(true);
  }, [key]);

  const setValue = useCallback(
    (value: React.SetStateAction<T>) => {
      setStoredValue((prev) => {
        const valueToStore =
          value instanceof Function ? (value as (prev: T) => T)(prev) : value;
        // Save to localStorage
        try {
          window.localStorage.setItem(key, JSON.stringify(valueToStore));
        } catch (error) {
          console.error(error);
        }
        return valueToStore;
      });
    },
    [key]
  );

  return [storedValue, setValue, initialized];
};
