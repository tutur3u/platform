import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ThemeModePreview } from './theme-mode-preview';

const configs: Record<string, string | undefined> = {};
const mockUseUserConfig = vi.fn((configId: string) => ({
  data: configs[configId],
}));

vi.mock('@tuturuuu/ui/hooks/use-user-config', () => ({
  useUserConfig: (configId: string) => mockUseUserConfig(configId),
}));

function previewSides() {
  return Array.from(
    screen
      .getByTestId('theme-mode-preview')
      .querySelectorAll('[data-sorbet-preview]')
  ).map((side) => [
    side.getAttribute('data-sorbet-preview'),
    side.getAttribute('data-sorbet-preview-mode'),
  ]);
}

beforeEach(() => {
  for (const key of Object.keys(configs)) delete configs[key];
  mockUseUserConfig.mockClear();
});

describe('ThemeModePreview', () => {
  it('shows the classic grounds while Sorbet is turned off', () => {
    configs.EXPERIMENTAL_SORBET_UI = 'false';
    render(<ThemeModePreview mode="dark" />);

    expect(screen.getByTestId('theme-mode-preview')).toHaveClass(
      'bg-slate-950'
    );
    expect(previewSides()).toEqual([]);
  });

  it('shows the chosen Sorbet palette for each mode while Sorbet is on', () => {
    configs.EXPERIMENTAL_SORBET_UI = 'true';
    configs.SORBET_THEME = JSON.stringify({ preset: 'matcha' });

    const { unmount } = render(<ThemeModePreview mode="light" />);
    expect(previewSides()).toEqual([['matcha', 'light']]);
    unmount();

    render(<ThemeModePreview mode="system" />);
    expect(previewSides()).toEqual([
      ['matcha', 'light'],
      ['matcha', 'dark'],
    ]);
  });

  it('shows Sorbet when the account never chose, since it is the default', () => {
    render(<ThemeModePreview mode="light" />);

    expect(previewSides()).toEqual([['sorbet', 'light']]);
  });

  it('falls back to the default palette when the stored theme is invalid', () => {
    configs.EXPERIMENTAL_SORBET_UI = 'true';
    configs.SORBET_THEME = 'not json';

    render(<ThemeModePreview mode="dark" />);

    expect(previewSides()).toEqual([['sorbet', 'dark']]);
  });

  it('reads the shared account config entries', () => {
    render(<ThemeModePreview mode="light" />);

    expect(mockUseUserConfig).toHaveBeenCalledWith('EXPERIMENTAL_SORBET_UI');
    expect(mockUseUserConfig).toHaveBeenCalledWith('SORBET_THEME');
  });
});
