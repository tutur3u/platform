import { fireEvent, render, screen } from '@testing-library/react';
import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

beforeAll(() => {
  globalThis.ResizeObserver = class ResizeObserver {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
});
import type { useWorkspaceVisibility } from '../../../../hooks/use-workspace-visibility';
import {
  useWorkspacePickerShortcut,
  WorkspacePickerDialog,
} from '../workspace-picker-dialog';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('../workspace-select-icon', () => ({
  WorkspaceIcon: () => <span aria-hidden="true" />,
}));

const pinned: InternalApiWorkspaceSummary = {
  id: 'pin',
  name: 'Pinned studio',
  personal: false,
  avatar_url: null,
  logo_url: null,
  tier: 'PRO',
};
const recent: InternalApiWorkspaceSummary = {
  ...pinned,
  id: 'recent',
  name: 'Recent lab',
  tier: 'FREE',
};
const other: InternalApiWorkspaceSummary = {
  ...pinned,
  id: 'other',
  name: 'All hands',
  tier: 'PLUS',
};
const hidden: InternalApiWorkspaceSummary = {
  ...pinned,
  id: 'hidden',
  name: 'Hidden loft',
  tier: 'ENTERPRISE',
};

function visibility(overrides = {}) {
  return {
    actorId: 'user-1',
    known: true,
    hiddenIds: ['hidden'],
    pending: new Set<string>(),
    isError: false,
    updateError: null,
    setHidden: vi.fn().mockResolvedValue(undefined),
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useWorkspaceVisibility>;
}

const preferences = {
  pinned: ['pin'],
  recent: ['recent', 'pin'],
  record: vi.fn(),
  togglePin: vi.fn(),
};

function renderPicker(
  overrides: Partial<Parameters<typeof WorkspacePickerDialog>[0]> = {}
) {
  return render(
    <WorkspacePickerDialog
      currentId="pin"
      defaultId="other"
      onOpenChange={vi.fn()}
      onSelect={vi.fn()}
      onCreate={vi.fn()}
      onJoin={vi.fn()}
      onDefault={vi.fn()}
      open
      preferences={preferences}
      trigger={<button type="button">Open picker</button>}
      visibility={visibility()}
      workspaces={[pinned, recent, other, hidden]}
      {...overrides}
    />
  );
}

describe('WorkspacePickerDialog', () => {
  it('renders the command dialog contract', () => {
    renderPicker();
    const dialog = screen.getByTestId('workspace-picker-dialog');
    expect(dialog).toHaveAttribute('role', 'dialog');
    expect(dialog).toHaveAttribute('data-variant', 'dialog');
    expect(dialog).toHaveAccessibleName('select_workspace');
    const search = screen.getByTestId('workspace-picker-search');
    expect(search).toHaveAttribute('aria-label', 'search_workspace');
    const list = screen.getByRole('listbox');
    expect(list).toBeInTheDocument();
    const pinnedSection = screen.getByTestId('workspace-picker-section-pinned');
    const recentSection = screen.getByTestId('workspace-picker-section-recent');
    const allSection = screen.getByTestId('workspace-picker-section-all');
    const hiddenSection = screen.getByTestId('workspace-picker-section-hidden');
    expect(
      pinnedSection.compareDocumentPosition(recentSection) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      recentSection.compareDocumentPosition(allSection) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      allSection.compareDocumentPosition(hiddenSection) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(screen.getByTestId('workspace-picker-row-pin')).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByTestId('workspace-picker-row-pin')).toHaveAttribute(
      'data-current',
      'true'
    );
    expect(screen.queryByTestId('workspace-picker-row-hidden')).toBeNull();
    const toggle = screen.getByTestId('workspace-picker-hidden-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByTestId('workspace-picker-row-hidden')
    ).toBeInTheDocument();
    expect(screen.getByTestId('workspace-picker-join')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-picker-create')).toBeInTheDocument();
    expect(
      screen.queryByTestId('workspace-picker-section-invitations')
    ).toBeNull();
  });

  it('shows invitations only when some are pending', () => {
    const { rerender } = renderPicker({
      invitationCount: 1,
      invitations: <p>Invite Acme</p>,
    });
    expect(
      screen.getByTestId('workspace-picker-section-invitations')
    ).toHaveTextContent('Invite Acme');
    rerender(
      <WorkspacePickerDialog
        currentId="pin"
        invitations={null}
        onOpenChange={vi.fn()}
        onSelect={vi.fn()}
        open
        preferences={preferences}
        trigger={<button type="button">Open picker</button>}
        visibility={visibility()}
        workspaces={[pinned]}
      />
    );
    expect(
      screen.queryByTestId('workspace-picker-section-invitations')
    ).toBeNull();
  });

  it('shows a retry action when the workspace list fails', () => {
    const onRetryList = vi.fn();
    renderPicker({
      listError: new Error('offline'),
      onRetryList,
      workspaces: [],
      visibility: visibility({ hiddenIds: [] }),
    });
    fireEvent.click(screen.getByTestId('workspace-picker-retry'));
    expect(onRetryList).toHaveBeenCalledOnce();
  });

  it('shows skeleton rows while the list is loading', () => {
    renderPicker({
      listLoading: true,
      visibility: visibility({ known: false, hiddenIds: [] }),
      workspaces: [],
    });
    expect(screen.getByRole('status')).toHaveTextContent('loading');
    expect(screen.queryByRole('option')).toBeNull();
  });
});

function ShortcutHarness() {
  const [opened, setOpened] = useState(0);
  useWorkspacePickerShortcut(() => setOpened((count) => count + 1));
  return <output data-testid="opens">{opened}</output>;
}

describe('useWorkspacePickerShortcut', () => {
  it('opens on Ctrl+Shift+K and ignores plain Ctrl+K', () => {
    render(<ShortcutHarness />);
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(screen.getByTestId('opens')).toHaveTextContent('0');
    fireEvent.keyDown(document, { key: 'K', ctrlKey: true, shiftKey: true });
    expect(screen.getByTestId('opens')).toHaveTextContent('1');
    fireEvent.keyDown(document, { key: 'k', metaKey: true, shiftKey: true });
    expect(screen.getByTestId('opens')).toHaveTextContent('2');
  });
});
