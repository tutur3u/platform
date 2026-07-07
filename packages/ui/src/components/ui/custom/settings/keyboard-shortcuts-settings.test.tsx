import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KeyboardShortcutsSettings } from './keyboard-shortcuts-settings';

vi.mock('next-intl', () => ({
  useTranslations:
    (namespace?: string) =>
    (key: string): string =>
      namespace ? `${namespace}.${key}` : key,
}));

vi.mock('@tuturuuu/utils/hooks/use-platform', () => ({
  usePlatform: () => ({
    modKey: 'Ctrl',
    modKeyAlt: 'Alt',
  }),
}));

describe('KeyboardShortcutsSettings', () => {
  it('renders sidebar shortcut rows with platform-aware key labels', () => {
    render(<KeyboardShortcutsSettings />);

    expect(
      screen.getByText('settings.keyboard_shortcuts.toggle_sidebar')
    ).toBeInTheDocument();
    expect(
      screen.getByText('settings.keyboard_shortcuts.hide_sidebar')
    ).toBeInTheDocument();
    expect(screen.getAllByText('Ctrl').length).toBeGreaterThanOrEqual(3);
    expect(screen.getAllByText('Alt').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('B')).toHaveLength(2);
  });
});
