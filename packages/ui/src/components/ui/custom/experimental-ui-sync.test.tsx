import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExperimentalUiSync } from './experimental-ui-sync';
import {
  NAV_LABELS_ATTRIBUTE,
  NAV_LABELS_CHANGE_EVENT,
  NAV_LABELS_STORAGE_KEY,
} from './nav-labels';
import {
  SORBET_THEME_CHANGE_EVENT,
  SORBET_THEME_STORAGE_KEY,
} from './sorbet-theme';
import { SORBET_UI_CHANGE_EVENT, SORBET_UI_STORAGE_KEY } from './sorbet-ui';

const mockGetUserConfig = vi.fn();

vi.mock('@tuturuuu/internal-api/users', () => ({
  getUserConfig: (...args: unknown[]) => mockGetUserConfig(...args),
  updateUserConfig: vi.fn(),
}));

const root = () => document.documentElement;

/** Answers each config id from `values`; missing ids have no stored value. */
function accountValues(values: Record<string, string | null>) {
  mockGetUserConfig.mockImplementation(async (id: string) => ({
    value: values[id] ?? null,
  }));
}

function renderWithQueryClient(ui: ReactNode) {
  const client = new QueryClient();
  return render(
    <QueryClientProvider client={client}>{ui}</QueryClientProvider>
  );
}

beforeEach(() => {
  mockGetUserConfig.mockReset();
});

afterEach(() => {
  root().removeAttribute('data-ui');
  root().removeAttribute('data-sorbet-preset');
  root().removeAttribute(NAV_LABELS_ATTRIBUTE);
  window.localStorage.clear();
});

describe('ExperimentalUiSync', () => {
  it('applies the account values', async () => {
    accountValues({
      EXPERIMENTAL_SORBET_UI: 'true',
      SORBET_THEME: '{"preset":"lagoon"}',
    });
    renderWithQueryClient(<ExperimentalUiSync />);

    await waitFor(() => expect(root().getAttribute('data-ui')).toBe('sorbet'));
    await waitFor(() =>
      expect(root().getAttribute('data-sorbet-preset')).toBe('lagoon')
    );
    expect(mockGetUserConfig).toHaveBeenCalledWith('EXPERIMENTAL_SORBET_UI');
    expect(mockGetUserConfig).toHaveBeenCalledWith('SORBET_THEME');
  });

  it('applies the device values first and keeps them when the reads fail, without retrying', async () => {
    window.localStorage.setItem(SORBET_UI_STORAGE_KEY, 'true');
    window.localStorage.setItem(
      SORBET_THEME_STORAGE_KEY,
      '{"preset":"matcha"}'
    );
    mockGetUserConfig.mockRejectedValue(new Error('401'));
    renderWithQueryClient(<ExperimentalUiSync />);

    expect(root().getAttribute('data-ui')).toBe('sorbet');
    expect(root().getAttribute('data-sorbet-preset')).toBe('matcha');
    await waitFor(() => expect(mockGetUserConfig).toHaveBeenCalledTimes(3));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockGetUserConfig).toHaveBeenCalledTimes(3);
    expect(root().getAttribute('data-ui')).toBe('sorbet');
    expect(root().getAttribute('data-sorbet-preset')).toBe('matcha');
  });

  it('turns off when the account value is off, overriding the device value', async () => {
    window.localStorage.setItem(SORBET_UI_STORAGE_KEY, 'true');
    accountValues({ EXPERIMENTAL_SORBET_UI: 'false' });
    renderWithQueryClient(<ExperimentalUiSync />);

    await waitFor(() => expect(root().hasAttribute('data-ui')).toBe(false));
  });

  it('turns Sorbet on for an account that never chose, overriding a device opt-out', async () => {
    window.localStorage.setItem(SORBET_UI_STORAGE_KEY, 'false');
    accountValues({});
    renderWithQueryClient(<ExperimentalUiSync />);

    expect(root().hasAttribute('data-ui')).toBe(false);
    await waitFor(() => expect(root().getAttribute('data-ui')).toBe('sorbet'));
  });

  it('ignores a stored theme outside the allowlist', async () => {
    accountValues({
      EXPERIMENTAL_SORBET_UI: 'true',
      SORBET_THEME: '{"preset":"<script>"}',
    });
    renderWithQueryClient(<ExperimentalUiSync />);

    await waitFor(() => expect(root().getAttribute('data-ui')).toBe('sorbet'));
    await waitFor(() => expect(mockGetUserConfig).toHaveBeenCalledTimes(3));
    expect(root().hasAttribute('data-sorbet-preset')).toBe(false);
  });

  it('follows changes announced in this tab and in other tabs', async () => {
    accountValues({ EXPERIMENTAL_SORBET_UI: 'false' });
    renderWithQueryClient(<ExperimentalUiSync />);
    await waitFor(() => expect(mockGetUserConfig).toHaveBeenCalled());

    act(() => {
      window.dispatchEvent(
        new CustomEvent(SORBET_UI_CHANGE_EVENT, { detail: true })
      );
      window.dispatchEvent(
        new CustomEvent(SORBET_THEME_CHANGE_EVENT, {
          detail: '{"preset":"rose"}',
        })
      );
    });
    expect(root().getAttribute('data-ui')).toBe('sorbet');
    expect(root().getAttribute('data-sorbet-preset')).toBe('rose');

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: SORBET_UI_STORAGE_KEY,
          newValue: 'false',
        })
      );
    });
    expect(root().hasAttribute('data-ui')).toBe(false);
  });
});

describe('ExperimentalUiSync collapsed sidebar labels', () => {
  it('hides labels by default and shows them when the account turns them on', async () => {
    accountValues({});
    const view = renderWithQueryClient(<ExperimentalUiSync />);
    await waitFor(() =>
      expect(mockGetUserConfig).toHaveBeenCalledWith('SIDEBAR_NAV_LABELS')
    );
    expect(root().hasAttribute(NAV_LABELS_ATTRIBUTE)).toBe(false);
    view.unmount();

    accountValues({ SIDEBAR_NAV_LABELS: 'true' });
    renderWithQueryClient(<ExperimentalUiSync />);
    await waitFor(() =>
      expect(root().getAttribute(NAV_LABELS_ATTRIBUTE)).toBe('shown')
    );
    expect(window.localStorage.getItem(NAV_LABELS_STORAGE_KEY)).toBe('true');
  });

  it('applies the device value first and follows this tab and other tabs', () => {
    window.localStorage.setItem(NAV_LABELS_STORAGE_KEY, 'true');
    render(<ExperimentalUiSync account={false} />);
    expect(root().getAttribute(NAV_LABELS_ATTRIBUTE)).toBe('shown');

    act(() => {
      window.dispatchEvent(
        new CustomEvent(NAV_LABELS_CHANGE_EVENT, { detail: false })
      );
    });
    expect(root().hasAttribute(NAV_LABELS_ATTRIBUTE)).toBe(false);

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: NAV_LABELS_STORAGE_KEY,
          newValue: 'true',
        })
      );
    });
    expect(root().getAttribute(NAV_LABELS_ATTRIBUTE)).toBe('shown');
  });
});

describe('ExperimentalUiSync without an account', () => {
  it('applies Sorbet by default on a device with no stored choice', () => {
    render(<ExperimentalUiSync account={false} />);

    expect(root().getAttribute('data-ui')).toBe('sorbet');
    expect(mockGetUserConfig).not.toHaveBeenCalled();
  });

  it('applies the device values, needs no query client and never reads the account', () => {
    window.localStorage.setItem(SORBET_UI_STORAGE_KEY, 'true');
    window.localStorage.setItem(
      SORBET_THEME_STORAGE_KEY,
      '{"preset":"midnight"}'
    );
    render(<ExperimentalUiSync account={false} />);

    expect(root().getAttribute('data-ui')).toBe('sorbet');
    expect(root().getAttribute('data-sorbet-preset')).toBe('midnight');
    expect(mockGetUserConfig).not.toHaveBeenCalled();
  });

  it('follows changes from other tabs', () => {
    render(<ExperimentalUiSync account={false} />);

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: SORBET_UI_STORAGE_KEY,
          newValue: 'true',
        })
      );
    });
    expect(root().getAttribute('data-ui')).toBe('sorbet');
    expect(mockGetUserConfig).not.toHaveBeenCalled();
  });
});
