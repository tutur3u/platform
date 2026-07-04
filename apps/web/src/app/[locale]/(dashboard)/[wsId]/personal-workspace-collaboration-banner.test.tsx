// @vitest-environment jsdom
import { render, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PersonalWorkspaceCollaborationBanner } from './personal-workspace-collaboration-banner';

const STORAGE_KEY = 'personal-workspace-collaboration-banner-dismissed';

const mocks = vi.hoisted(() => ({
  toastInfo: vi.fn(),
}));

vi.mock('@tuturuuu/ui/sonner', () => ({
  toast: {
    info: mocks.toastInfo,
  },
}));

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => (key: string) =>
    namespace ? `${namespace}.${key}` : key,
}));

describe('PersonalWorkspaceCollaborationBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it('renders nothing in the dashboard body', () => {
    const { container } = render(<PersonalWorkspaceCollaborationBanner />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows a persistent dismissable Sonner toast when the notice has not been dismissed', async () => {
    render(<PersonalWorkspaceCollaborationBanner />);

    await waitFor(() => expect(mocks.toastInfo).toHaveBeenCalledTimes(1));

    expect(mocks.toastInfo).toHaveBeenCalledWith(
      'common.personal_workspace_collaboration_note',
      expect.objectContaining({
        closeButton: true,
        dismissible: true,
        duration: Number.POSITIVE_INFINITY,
        id: 'personal-workspace-collaboration-notice',
      })
    );
  });

  it('does not show a toast after the notice has been dismissed', async () => {
    window.localStorage.setItem(STORAGE_KEY, 'true');

    render(<PersonalWorkspaceCollaborationBanner />);

    await waitFor(() => expect(mocks.toastInfo).not.toHaveBeenCalled());
  });

  it('persists dismissal when the toast is dismissed', async () => {
    render(<PersonalWorkspaceCollaborationBanner />);

    await waitFor(() => expect(mocks.toastInfo).toHaveBeenCalledTimes(1));

    const toastOptions = mocks.toastInfo.mock.calls[0]?.[1] as {
      onDismiss?: () => void;
    };
    toastOptions.onDismiss?.();

    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('true');
  });
});
