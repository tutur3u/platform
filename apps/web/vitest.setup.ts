// Setup global mocks for jsdom environment
if (typeof window !== 'undefined') {
  // LocalStorage is usually provided by jsdom, but ensure it's available
  if (typeof localStorage === 'undefined') {
    const localStorageMock = (() => {
      let store: Record<string, string> = {};

      /**
       * Dispatches a storage event to simulate cross-tab behavior
       */
      const dispatchStorageEvent = (
        key: string | null,
        oldValue: string | null,
        newValue: string | null
      ) => {
        if (typeof window === 'undefined') return;

        const storageEvent = new StorageEvent('storage', {
          key,
          oldValue,
          newValue,
          storageArea: localStorageMock as unknown as Storage,
          url: window.location.href,
        });

        window.dispatchEvent(storageEvent);
      };

      return {
        getItem: (key: string) => {
          return key in store ? store[key] : null;
        },
        setItem: (key: string, value: string) => {
          const oldValue = store[key] || null;
          store[key] = value;
          // Dispatch storage event after mutation
          dispatchStorageEvent(key, oldValue, value);
        },
        removeItem: (key: string) => {
          const oldValue = store[key] || null;
          delete store[key];
          // Dispatch storage event after mutation
          dispatchStorageEvent(key, oldValue, null);
        },
        clear: () => {
          store = {};
          // Dispatch storage event with null key to indicate full clear
          dispatchStorageEvent(null, null, null);
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
