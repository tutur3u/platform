import '@testing-library/jest-dom';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExperimentalUiSetting } from './experimental-ui-setting';

const mockUseUserBooleanConfig = vi.fn();
const mockSetValue = vi.fn();
const mockUseUserConfig = vi.fn();
const mockMutate = vi.fn();

vi.mock('@tuturuuu/ui/hooks/use-user-config', () => ({
  useUserBooleanConfig: (...args: unknown[]) =>
    mockUseUserBooleanConfig(...args),
  useUserConfig: (...args: unknown[]) => mockUseUserConfig(...args),
  useUpdateUserConfig: () => ({ mutate: mockMutate }),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

beforeEach(() => {
  mockSetValue.mockReset();
  mockMutate.mockReset();
  mockUseUserConfig.mockReturnValue({ data: '', isLoading: false });
  mockUseUserBooleanConfig.mockReturnValue({
    isLoading: false,
    isPending: false,
    setValue: mockSetValue,
    value: false,
  });
});

afterEach(() => {
  document.documentElement.removeAttribute('data-ui');
  document.documentElement.removeAttribute('data-sorbet-preset');
  document.documentElement.removeAttribute('data-sorbet-radius');
  window.localStorage.clear();
});

describe('ExperimentalUiSetting', () => {
  it('reads the account config, on by default', () => {
    render(<ExperimentalUiSetting />);

    expect(mockUseUserBooleanConfig).toHaveBeenCalledWith(
      'EXPERIMENTAL_SORBET_UI',
      true,
      { parse: expect.any(Function) }
    );
    const [, , options] = mockUseUserBooleanConfig.mock.calls[0] as [
      string,
      boolean,
      { parse: (raw: string) => boolean },
    ];
    expect(options.parse('false')).toBe(false);
    expect(options.parse('TRUE')).toBe(true);
  });

  it('shows the switch off only for an explicit opt-out', () => {
    render(<ExperimentalUiSetting />);

    expect(
      screen.getByRole('switch', { name: 'setting_toggle_label' })
    ).not.toBeChecked();
    expect(screen.queryByText('badge')).toBeNull();
  });

  it('saves to the account and applies the design immediately', () => {
    render(<ExperimentalUiSetting />);
    fireEvent.click(
      screen.getByRole('switch', { name: 'setting_toggle_label' })
    );

    expect(mockSetValue).toHaveBeenCalledWith(true);
    expect(document.documentElement.getAttribute('data-ui')).toBe('sorbet');
  });

  it('gives the switch a 44px touch target', () => {
    render(<ExperimentalUiSetting />);

    // 20px switch + 12px on each side.
    expect(
      screen.getByRole('switch', { name: 'setting_toggle_label' })
    ).toHaveClass('relative', 'after:absolute', 'after:-inset-3');
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

  it('hides the palette while the design is off', () => {
    render(<ExperimentalUiSetting />);

    expect(screen.queryByRole('radiogroup')).toBeNull();
    expect(mockUseUserConfig).not.toHaveBeenCalled();
  });

  it('shows the palette while the design is on and saves a choice', () => {
    mockUseUserBooleanConfig.mockReturnValue({
      isLoading: false,
      isPending: false,
      setValue: mockSetValue,
      value: true,
    });
    render(<ExperimentalUiSetting />);

    const palette = screen.getByRole('radiogroup', { name: 'palette_title' });
    expect(within(palette).getAllByRole('radio')).toHaveLength(10);
    expect(screen.getByRole('radio', { name: 'presets.sorbet' })).toBeChecked();

    fireEvent.click(screen.getByRole('radio', { name: 'presets.matcha' }));

    expect(document.documentElement.getAttribute('data-sorbet-preset')).toBe(
      'matcha'
    );
    expect(mockMutate).toHaveBeenCalledWith({
      configId: 'SORBET_THEME',
      value: JSON.stringify({
        preset: 'matcha',
        accent: null,
        radius: 'soft',
        density: 'comfortable',
        font: 'nunito',
      }),
    });
  });

  it('offers Soft, Sharp and Round corners and saves a choice', () => {
    mockUseUserBooleanConfig.mockReturnValue({
      isLoading: false,
      isPending: false,
      setValue: mockSetValue,
      value: true,
    });
    render(<ExperimentalUiSetting />);

    const corners = screen.getByRole('radiogroup', { name: 'corners_title' });
    expect(
      within(corners)
        .getAllByRole('radio')
        .map((radio) => radio.getAttribute('value'))
    ).toEqual(['soft', 'sharp', 'round']);
    expect(screen.getByRole('radio', { name: 'corners.soft' })).toBeChecked();

    fireEvent.click(screen.getByRole('radio', { name: 'corners.sharp' }));

    expect(document.documentElement.getAttribute('data-sorbet-radius')).toBe(
      'sharp'
    );
    expect(mockMutate).toHaveBeenCalledWith({
      configId: 'SORBET_THEME',
      value: JSON.stringify({
        preset: 'sorbet',
        accent: null,
        radius: 'sharp',
        density: 'comfortable',
        font: 'nunito',
      }),
    });
  });
});
