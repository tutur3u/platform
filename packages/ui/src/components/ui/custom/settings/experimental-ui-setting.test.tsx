import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExperimentalUiSetting } from './experimental-ui-setting';

const mockUseUserBooleanConfig = vi.fn();
const mockSetValue = vi.fn();

vi.mock('@tuturuuu/ui/hooks/use-user-config', () => ({
  useUserBooleanConfig: (...args: unknown[]) =>
    mockUseUserBooleanConfig(...args),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

beforeEach(() => {
  mockSetValue.mockReset();
  mockUseUserBooleanConfig.mockReturnValue({
    isLoading: false,
    isPending: false,
    setValue: mockSetValue,
    value: false,
  });
});

afterEach(() => {
  document.documentElement.removeAttribute('data-ui');
  window.localStorage.clear();
});

describe('ExperimentalUiSetting', () => {
  it('reads the account config, off by default', () => {
    render(<ExperimentalUiSetting />);

    expect(mockUseUserBooleanConfig).toHaveBeenCalledWith(
      'EXPERIMENTAL_SORBET_UI',
      false
    );
    expect(
      screen.getByRole('switch', { name: 'setting_toggle_label' })
    ).not.toBeChecked();
  });

  it('saves to the account and applies the design immediately', () => {
    render(<ExperimentalUiSetting />);
    fireEvent.click(
      screen.getByRole('switch', { name: 'setting_toggle_label' })
    );

    expect(mockSetValue).toHaveBeenCalledWith(true);
    expect(document.documentElement.getAttribute('data-ui')).toBe('sorbet');
  });

  it('disables the switch while the value loads', () => {
    mockUseUserBooleanConfig.mockReturnValue({
      isLoading: true,
      isPending: false,
      setValue: mockSetValue,
      value: false,
    });
    render(<ExperimentalUiSetting />);

    expect(
      screen.getByRole('switch', { name: 'setting_toggle_label' })
    ).toBeDisabled();
  });
});
