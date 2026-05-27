import '@testing-library/jest-dom';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { VersionBadge, VersionBadgeSetting } from './version-badge';

const mockUseUserBooleanConfig = vi.fn();

vi.mock('@tuturuuu/ui/hooks/use-user-config', () => ({
  useUserBooleanConfig: (...args: unknown[]) =>
    mockUseUserBooleanConfig(...args),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('@tuturuuu/ui/hover-card', () => ({
  HoverCard: ({ children }: { children: ReactNode }) => <>{children}</>,
  HoverCardContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  HoverCardTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
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

  it('renders compact version text and deployment details when enabled', () => {
    mockUseUserBooleanConfig.mockReturnValue({
      isLoading: false,
      value: true,
    });

    render(<VersionBadge release={release} />);

    expect(screen.getByText('v0.1.0')).toBeInTheDocument();
    expect(screen.getByText('abcdef1')).toBeInTheDocument();
    expect(screen.getByText('feat: ship version badge')).toBeInTheDocument();
    expect(screen.getByText('2026-05-27T10:00:00.000Z')).toBeInTheDocument();
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
    expect(screen.getByText('SHOW_VERSION_BADGE=true')).toBeInTheDocument();
    expect(screen.getByLabelText('setting_toggle_label')).toBeInTheDocument();
  });
});
