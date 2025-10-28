// Setup global mocks for jsdom environment
if (typeof window !== 'undefined') {
  // LocalStorage is usually provided by jsdom, but ensure it's available
  if (typeof localStorage === 'undefined') {
    const localStorageMock = (() => {
      let store: Record<string, string> = {};

      return {
        getItem: (key: string) => {
          return store[key] || null;
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
          return keys[index] || null;
        },
      };
    })();

    Object.defineProperty(window, 'localStorage', {
      value: localStorageMock,
      writable: true,
      configurable: true,
    });
  }
}
