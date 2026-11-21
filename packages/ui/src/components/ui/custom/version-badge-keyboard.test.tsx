import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { VersionBadge } from './version-badge';

vi.mock('@tuturuuu/ui/hooks/use-user-config', () => ({
  useUserBooleanConfig: () => ({ isLoading: false, value: true }),
}));

vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  const format = actual.createFormatter({ locale: 'en', timeZone: 'UTC' });
  return {
    useFormatter: () => format,
    useNow: () => new Date('2026-05-27T10:05:00.000Z'),
    useTimeZone: () => 'UTC',
    useTranslations: () => (key: string) => key,
  };
});

const release = {
  appName: 'Mail',
  builtAt: '2026-05-27T10:00:00.000Z',
  commitHash: 'abcdef1234567890',
  commitMessage: 'feat: ship version badge',
  deploymentStamp: null,
  deploymentUrl: null,
  environment: 'local',
  refName: 'main',
  shortCommitHash: 'abcdef1',
  version: '0.1.0',
};

describe('VersionBadge keyboard and touch access', () => {
  it('opens its details from the keyboard and keeps the time toggle focusable', async () => {
    render(<VersionBadge release={release} />);

    const trigger = screen.getByRole('button', { name: 'trigger_label' });
    trigger.focus();
    // Radix opens a popover trigger on click, which Enter, Space and tap all fire.
    fireEvent.click(trigger);

    const toggle = await screen.findByRole('button', {
      name: /built_at_toggle_label/,
    });
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    // HoverCard content sets tabindex=-1 on focusable descendants; a popover
    // keeps them in the tab order.
    expect(toggle).not.toHaveAttribute('tabindex', '-1');
    toggle.focus();
    expect(toggle).toHaveFocus();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
  });
});
