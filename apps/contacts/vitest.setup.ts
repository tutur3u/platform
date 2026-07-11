import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Authed pages opt into request-time rendering with `connection()` (required
// under cacheComponents so Next never prerenders them without cookies). Unit
// tests invoke the pages directly, outside a request scope, where `connection()`
// throws — stub it while keeping every other next/server export.
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn().mockResolvedValue(undefined),
}));

// Automatically cleanup after each test to prevent React 19 scheduler issues
afterEach(() => {
  cleanup();
});

// Setup global mocks for jsdom environment
const createLocalStorageMock = () => {
  let store: Record<string, string> = {};

  const localStorageMock = {
    getItem: (key: string) => {
      return key in store ? store[key] : null;
    },
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
      return keys[index] ?? null;
    },
  };

  return localStorageMock;
};

// Always set up localStorage mock for tests
if (typeof window !== 'undefined') {
  const localStorageMock = createLocalStorageMock();

  Object.defineProperty(window, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
  });

  Object.defineProperty(global, 'localStorage', {
    value: localStorageMock,
    writable: true,
    configurable: true,
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
