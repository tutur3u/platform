import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExperimentalUiSync } from './experimental-ui-sync';
import { SORBET_UI_CHANGE_EVENT, SORBET_UI_STORAGE_KEY } from './sorbet-ui';

const mockGetUserConfig = vi.fn();

vi.mock('@tuturuuu/internal-api/users', () => ({
  getUserConfig: (...args: unknown[]) => mockGetUserConfig(...args),
}));

const root = () => document.documentElement;

beforeEach(() => {
  mockGetUserConfig.mockReset();
});

afterEach(() => {
  root().removeAttribute('data-ui');
  window.localStorage.clear();
});

describe('ExperimentalUiSync', () => {
  it('applies the account value', async () => {
    mockGetUserConfig.mockResolvedValue({ value: 'true' });
    render(<ExperimentalUiSync />);

    await waitFor(() => expect(root().getAttribute('data-ui')).toBe('sorbet'));
    expect(mockGetUserConfig).toHaveBeenCalledWith('EXPERIMENTAL_SORBET_UI');
  });

  it('applies the device value first and keeps it when the read fails', async () => {
    window.localStorage.setItem(SORBET_UI_STORAGE_KEY, 'true');
    mockGetUserConfig.mockRejectedValue(new Error('401'));
    render(<ExperimentalUiSync />);

    expect(root().getAttribute('data-ui')).toBe('sorbet');
    await waitFor(() => expect(mockGetUserConfig).toHaveBeenCalled());
    expect(root().getAttribute('data-ui')).toBe('sorbet');
  });

  it('turns off when the account value is off, overriding the device value', async () => {
    window.localStorage.setItem(SORBET_UI_STORAGE_KEY, 'true');
    mockGetUserConfig.mockResolvedValue({ value: null });
    render(<ExperimentalUiSync />);

    await waitFor(() => expect(root().hasAttribute('data-ui')).toBe(false));
  });

  it('follows changes announced in this tab and in other tabs', async () => {
    mockGetUserConfig.mockResolvedValue({ value: 'false' });
    render(<ExperimentalUiSync />);
    await waitFor(() => expect(mockGetUserConfig).toHaveBeenCalled());

    act(() => {
      window.dispatchEvent(
        new CustomEvent(SORBET_UI_CHANGE_EVENT, { detail: true })
      );
    });
    expect(root().getAttribute('data-ui')).toBe('sorbet');

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
