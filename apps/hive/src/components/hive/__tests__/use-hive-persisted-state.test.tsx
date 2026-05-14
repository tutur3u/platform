import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useHivePersistedState } from '../use-hive-persisted-state';

function isPanelState(value: unknown): value is 'closed' | 'open' {
  return value === 'closed' || value === 'open';
}

function Harness({ storageKey }: { storageKey: string }) {
  const [value, setValue] = useHivePersistedState(storageKey, 'closed', {
    validate: isPanelState,
  });

  return (
    <button onClick={() => setValue('open')} type="button">
      {value}
    </button>
  );
}

describe('useHivePersistedState', () => {
  beforeEach(() => {
    installLocalStorageMock();
    window.localStorage.clear();
  });

  it('hydrates a valid local preference and writes changes back', async () => {
    window.localStorage.setItem('hive.test.panel', JSON.stringify('open'));

    render(<Harness storageKey="hive.test.panel" />);

    await waitFor(() =>
      expect(screen.getByRole('button').textContent).toBe('open')
    );

    fireEvent.click(screen.getByRole('button'));

    await waitFor(() =>
      expect(window.localStorage.getItem('hive.test.panel')).toBe(
        JSON.stringify('open')
      )
    );
  });

  it('falls back when a persisted preference no longer validates', async () => {
    window.localStorage.setItem('hive.test.panel', JSON.stringify('stale'));

    render(<Harness storageKey="hive.test.panel" />);

    await waitFor(() =>
      expect(screen.getByRole('button').textContent).toBe('closed')
    );
    expect(window.localStorage.getItem('hive.test.panel')).toBe(
      JSON.stringify('closed')
    );
  });
});

function installLocalStorageMock() {
  const store = new Map<string, string>();

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      removeItem: (key: string) => store.delete(key),
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
    },
  });
}
