import '@testing-library/jest-dom';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import {
  type OnUrlUpdateFunction,
  withNuqsTestingAdapter,
} from 'nuqs/adapters/testing';
import { type ReactNode, useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Dialog } from '../../dialog';
import {
  SettingsDialogShell,
  type SettingsNavGroup,
} from '../settings-dialog-shell';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

function TestIcon({ className }: { className?: string }) {
  return <span className={className} data-testid="test-icon" />;
}

const navItems: SettingsNavGroup[] = [
  {
    label: 'Account',
    items: [
      {
        description: 'Manage profile',
        icon: TestIcon,
        label: 'Profile',
        name: 'profile',
      },
      {
        description: 'Security settings',
        disabled: true,
        icon: TestIcon,
        label: 'Security',
        name: 'security',
      },
    ],
  },
  {
    label: 'Preferences',
    items: [
      {
        description: 'Appearance settings',
        icon: TestIcon,
        label: 'Appearance',
        name: 'appearance',
      },
      {
        description: 'Forms settings',
        hideContentHeader: true,
        icon: TestIcon,
        label: 'Forms',
        name: 'forms',
      },
    ],
  },
];

function renderShell(
  activeGroupBreadcrumb?: ReactNode,
  options?: {
    onUrlUpdate?: OnUrlUpdateFunction;
    searchParams?: string;
  }
) {
  function Harness() {
    const [activeTab, setActiveTab] = useState('profile');

    return (
      <Dialog open>
        <SettingsDialogShell
          activeTab={activeTab}
          activeGroupBreadcrumb={activeGroupBreadcrumb}
          keyboardNavigation
          navItems={navItems}
          onActiveTabChange={setActiveTab}
        >
          <input aria-label="Editable field" />
          <div data-testid="active-tab">{activeTab}</div>
        </SettingsDialogShell>
      </Dialog>
    );
  }

  return render(<Harness />, {
    wrapper: withNuqsTestingAdapter(options),
  });
}

describe('SettingsDialogShell keyboard navigation', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 1024,
    });
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
    }));
  });

  it('renders the fullscreen settings sheet chrome', () => {
    renderShell();

    const dialog = screen.getByRole('dialog');
    const className = dialog.getAttribute('class') ?? '';

    expect(dialog).toHaveClass('h-dvh');
    expect(dialog).toHaveClass('w-screen');
    expect(dialog).toHaveClass('bg-background');
    expect(dialog).toHaveClass('rounded-none');
    expect(className).not.toMatch(/animate-in|fade-in|zoom-in|slide-in/);
    expect(
      screen.getAllByRole('button', { name: 'settings.back_to_app' }).length
    ).toBeGreaterThan(0);
  });

  it('keeps the mobile selector first, closes with an X, and uses compact padding', () => {
    Object.defineProperty(window, 'innerWidth', {
      configurable: true,
      value: 375,
    });
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: true,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
    }));

    renderShell();

    const selector = screen.getByRole('combobox');
    const closeIcon = screen.getByTestId('settings-mobile-close-icon');
    const closeButton = closeIcon.closest('button');

    expect(closeButton).toHaveAccessibleName('common.close');
    expect(
      selector.compareDocumentPosition(closeButton as Node) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(closeButton?.parentElement).toHaveClass('px-2');
    expect(
      screen.getByTestId('active-tab').parentElement?.parentElement
    ).toHaveClass('p-2', 'md:p-6');
  });

  it('keeps settings groups expanded by default', () => {
    renderShell();

    expect(screen.getAllByText('Profile').length).toBeGreaterThan(0);
    expect(screen.getByText('Appearance')).toBeVisible();
    expect(screen.getByText('Forms')).toBeVisible();
  });

  it('can replace the active group crumb with an interactive context control', () => {
    renderShell(<button type="button">Switch workspace</button>);

    const breadcrumb = screen.getByTestId('settings-active-group-breadcrumb');

    expect(breadcrumb).toContainElement(
      screen.getByRole('button', { name: 'Switch workspace' })
    );
    expect(breadcrumb).not.toHaveTextContent('Account');
  });

  it('focuses settings search with slash and modifier search shortcuts', () => {
    renderShell();

    const dialog = screen.getByRole('dialog');
    const searchInput = screen.getByPlaceholderText(
      'settings.search_settings_placeholder'
    );

    fireEvent.keyDown(dialog, { key: '/' });
    expect(searchInput).toHaveFocus();

    const editableInput = screen.getByLabelText('Editable field');
    editableInput.focus();

    fireEvent.keyDown(editableInput, { ctrlKey: true, key: 'f' });
    expect(searchInput).toHaveFocus();
  });

  it('moves between enabled settings sections with Alt navigation shortcuts', () => {
    renderShell();

    const dialog = screen.getByRole('dialog');
    const activeTab = screen.getByTestId('active-tab');

    fireEvent.keyDown(dialog, { altKey: true, key: 'ArrowDown' });
    expect(activeTab).toHaveTextContent('appearance');

    fireEvent.keyDown(dialog, { altKey: true, key: 'ArrowUp' });
    expect(activeTab).toHaveTextContent('profile');

    fireEvent.keyDown(dialog, { altKey: true, key: 'End' });
    expect(activeTab).toHaveTextContent('forms');

    fireEvent.keyDown(dialog, { altKey: true, key: 'Home' });
    expect(activeTab).toHaveTextContent('profile');
  });

  it('restores the active section from the URL and persists tab changes', async () => {
    const onUrlUpdate = vi.fn<OnUrlUpdateFunction>();

    renderShell(undefined, {
      onUrlUpdate,
      searchParams: '?settingsDialog=open&settingsTab=appearance',
    });

    await waitFor(() =>
      expect(screen.getByTestId('active-tab')).toHaveTextContent('appearance')
    );

    fireEvent.click(screen.getAllByText('Profile')[0]!);

    await waitFor(() => {
      const update = onUrlUpdate.mock.calls.at(-1)?.[0];
      expect(update?.searchParams.get('settingsTab')).toBe('profile');
    });
  });

  it('does not handle navigation shortcuts outside the dialog content', () => {
    renderShell();

    fireEvent.keyDown(document, { altKey: true, key: 'ArrowDown' });

    expect(screen.getByTestId('active-tab')).toHaveTextContent('profile');
  });

  it('does not move sections while typing in editable fields', () => {
    renderShell();

    const editableInput = screen.getByLabelText('Editable field');
    editableInput.focus();

    fireEvent.keyDown(editableInput, { altKey: true, key: 'ArrowDown' });

    expect(screen.getByTestId('active-tab')).toHaveTextContent('profile');
  });

  it('can hide the shell content header for page-like settings sections', () => {
    renderShell();

    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { altKey: true, key: 'End' });

    expect(screen.getByTestId('active-tab')).toHaveTextContent('forms');
    expect(screen.getAllByText('Forms').length).toBeGreaterThan(0);
    expect(screen.queryByText('Forms settings')).not.toBeInTheDocument();
  });
});
