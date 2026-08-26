import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// Authed pages and Supabase-backed GET route handlers opt into request-time
// rendering with `connection()` (required under cacheComponents so Next never
// prerenders them without cookies). Unit tests invoke them directly, outside a
// request scope, where `connection()` throws — stub it while keeping every
// other next/server export.
vi.mock('next/server', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/server')>()),
  connection: vi.fn().mockResolvedValue(undefined),
}));

// Automatically cleanup after each test to prevent React 19 scheduler issues
afterEach(() => {
  cleanup();
});

const createLocalStorageMock = () => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => (key in store ? store[key] : null),
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
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
};

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

// jsdom implements no layout, so `scrollIntoView` does not exist on elements.
// The runtime calls it whenever it moves between screens or points at a
// validation error, and an unimplemented method there surfaces as an unhandled
// error from a passing test — noise that hides real ones.
if (
  typeof Element !== 'undefined' &&
  typeof Element.prototype.scrollIntoView !== 'function'
) {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: () => {},
  });
}
