import '@testing-library/jest-dom';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VersionBadge, VersionBadgeSetting } from './version-badge';

const mockUseUserBooleanConfig = vi.fn();

vi.mock('@tuturuuu/ui/hooks/use-user-config', () => ({
  useUserBooleanConfig: (...args: unknown[]) =>
    mockUseUserBooleanConfig(...args),
}));

vi.mock('next-intl', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next-intl')>();
  const format = actual.createFormatter({
    locale: 'en',
    timeZone: 'Asia/Ho_Chi_Minh',
  });
  return {
    useFormatter: () => format,
    useNow: () => new Date('2026-05-27T10:05:00.000Z'),
    useTimeZone: () => 'Asia/Ho_Chi_Minh',
    useTranslations: () => (key: string) => key,
  };
});

vi.mock('@tuturuuu/ui/popover', () => ({
  Popover: ({ children }: { children: ReactNode }) => <>{children}</>,
  PopoverContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

const release = {
  appName: 'Calendar',
  builtAt: '2026-05-27T10:00:00.000Z',
  commitHash: 'abcdef1234567890',
  commitMessage: 'feat: ship version badge',
  deploymentStamp: 'deploy-2026-05-27',
  deploymentUrl: 'https://calendar.tuturuuu.com',
  environment: 'production',
  refName: 'production',
  shortCommitHash: 'abcdef1',
  version: '0.1.0',
};

describe('VersionBadge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing while the account config is disabled', () => {
    mockUseUserBooleanConfig.mockReturnValue({
      isLoading: false,
      value: false,
    });

    const { container } = render(<VersionBadge release={release} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('reads the account config only after the first paint', () => {
    vi.useFakeTimers();
    try {
      mockUseUserBooleanConfig.mockReturnValue({
        isLoading: false,
        value: false,
      });
      render(<VersionBadge release={release} />);
      expect(mockUseUserBooleanConfig).toHaveBeenLastCalledWith(
        'SHOW_VERSION_BADGE',
        false,
        { enabled: false }
      );
      act(() => {
        vi.advanceTimersByTime(1500);
      });
      expect(mockUseUserBooleanConfig).toHaveBeenLastCalledWith(
        'SHOW_VERSION_BADGE',
        false,
        { enabled: true }
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders compact version text and deployment details when enabled', () => {
    mockUseUserBooleanConfig.mockReturnValue({
      isLoading: false,
      value: true,
    });

    render(<VersionBadge release={release} />);

    expect(screen.getAllByText('v0.1.0')).toHaveLength(2);
    expect(screen.getAllByText('abcdef1')).toHaveLength(2);
    expect(screen.getByText('feat: ship version badge')).toBeInTheDocument();
    expect(screen.getByText('5 minutes ago')).toBeInTheDocument();
  });

  it('shows the build time as relative time and toggles the exact time', () => {
    mockUseUserBooleanConfig.mockReturnValue({
      isLoading: false,
      value: true,
    });

    render(<VersionBadge release={release} />);

    const toggle = screen.getByRole('button', {
      name: /built_at_toggle_label/,
    });
    const exact = 'May 27, 2026, 5:00:00 PM GMT+7';
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(toggle).toHaveAttribute('title', exact);
    expect(toggle.querySelector('time')).toHaveAttribute(
      'datetime',
      '2026-05-27T10:00:00.000Z'
    );

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(exact)).toBeInTheDocument();
    expect(toggle).toHaveAttribute('title', '5 minutes ago');
  });

  it('reads a build clock ahead of the viewer as now, not the future', () => {
    mockUseUserBooleanConfig.mockReturnValue({
      isLoading: false,
      value: true,
    });

    render(
      <VersionBadge
        release={{ ...release, builtAt: '2026-05-27T10:06:00.000Z' }}
      />
    );

    expect(screen.getByText('now')).toBeInTheDocument();
  });

  it('shows a build without a timestamp as not available', () => {
    mockUseUserBooleanConfig.mockReturnValue({
      isLoading: false,
      value: true,
    });

    render(<VersionBadge release={{ ...release, builtAt: 'local' }} />);

    expect(screen.getAllByText('not_available').length).toBeGreaterThan(0);
    expect(
      screen.queryByRole('button', { name: /built_at_toggle_label/ })
    ).not.toBeInTheDocument();
  });

  it('stays hidden until hover, keyboard focus or open details', () => {
    mockUseUserBooleanConfig.mockReturnValue({
      isLoading: false,
      value: true,
    });

    render(<VersionBadge release={release} />);

    const trigger = screen.getByRole('button', { name: 'trigger_label' });
    expect(trigger).toHaveClass(
      'opacity-0',
      'hover:opacity-100',
      'focus-visible:opacity-100',
      'data-[state=open]:opacity-100',
      '[@media(hover:none)]:opacity-100'
    );
  });
});

describe('VersionBadgeSetting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when the user cannot manage the setting', () => {
    mockUseUserBooleanConfig.mockReturnValue({
      isLoading: false,
      isPending: false,
      setValue: vi.fn(),
      value: false,
    });

    const { container } = render(<VersionBadgeSetting canManage={false} />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders the account-scoped setting for eligible users', () => {
    mockUseUserBooleanConfig.mockReturnValue({
      isLoading: false,
      isPending: false,
      setValue: vi.fn(),
      value: true,
    });

    render(<VersionBadgeSetting canManage />);

    expect(screen.getByText('setting_title')).toBeInTheDocument();
    expect(screen.queryByText(/SHOW_VERSION_BADGE/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('setting_toggle_label')).toBeInTheDocument();
  });
});
