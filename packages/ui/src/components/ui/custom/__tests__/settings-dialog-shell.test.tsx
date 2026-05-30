import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
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
        icon: TestIcon,
        label: 'Forms',
        name: 'forms',
      },
    ],
  },
];

function renderShell() {
  function Harness() {
    const [activeTab, setActiveTab] = useState('profile');

    return (
      <Dialog open>
        <SettingsDialogShell
          activeTab={activeTab}
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

  return render(<Harness />);
}

describe('SettingsDialogShell keyboard navigation', () => {
  beforeEach(() => {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: vi.fn(),
    }));
  });

  it('focuses settings search with slash and modifier search shortcuts', () => {
    renderShell();

    const dialog = screen.getByRole('dialog');
    const searchInput = screen.getByPlaceholderText('search.search');

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
});
