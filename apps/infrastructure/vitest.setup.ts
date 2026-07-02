import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
});

const createLocalStorageMock = () => {
  let store: Record<string, string> = {};

  return {
    clear: () => {
      store = {};
    },
    getItem: (key: string) => (key in store ? store[key] : null),
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
  };
};

if (typeof window !== 'undefined') {
  const localStorageMock = createLocalStorageMock();

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: localStorageMock,
    writable: true,
  });

  Object.defineProperty(global, 'localStorage', {
    configurable: true,
    value: localStorageMock,
    writable: true,
  });
}

if (
  typeof document !== 'undefined' &&
  typeof document.elementFromPoint !== 'function'
) {
  Object.defineProperty(Document.prototype, 'elementFromPoint', {
    configurable: true,
    value() {
      return document.activeElement instanceof Element
        ? document.activeElement
        : document.body;
    },
  });
}
