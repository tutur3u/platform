import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { useWorkspaceVisibility } from '../../../../hooks/use-workspace-visibility';
import {
  useWorkspacePickerShortcut,
  WorkspacePickerDialog,
} from '../workspace-picker-dialog';
import { pickerRowColumns } from '../workspace-picker/row-layout';

beforeAll(() => {
  globalThis.ResizeObserver = class ResizeObserver {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
});

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('../workspace-select-icon', () => ({
  WorkspaceIcon: () => <span aria-hidden="true" />,
}));

function ws(
  id: string,
  name: string,
  extra: Partial<InternalApiWorkspaceSummary> = {}
): InternalApiWorkspaceSummary {
  return {
    id,
    name,
    personal: false,
    avatar_url: null,
    logo_url: null,
    tier: 'FREE',
    ...extra,
  };
}

const personal = ws('own', 'Personal', { personal: true });
const internal = ws(ROOT_WORKSPACE_ID, 'Platform', { tier: 'ENTERPRISE' });
const pinned = ws('pin', 'Pinned studio', { tier: 'PRO' });
const recent = ws('recent', 'Recent lab');
const other = ws('other', 'All hands', { tier: 'PLUS' });
const guest = ws('guest', 'Guest board', { access_type: 'guest' });
const longName = ws(
  'long',
  'Northwind regional tutoring cooperative and evening learning collective',
  { tier: 'ENTERPRISE' }
);
const hidden = ws('hidden', 'Hidden loft', { tier: 'ENTERPRISE' });
const ALL = [
  other,
  hidden,
  longName,
  guest,
  recent,
  pinned,
  internal,
  personal,
];

function visibility(overrides = {}) {
  return {
    actorId: 'actor-1',
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

function prefs() {
  return {
    // Personal and Internal entries must be ignored by Pinned and Recent.
    pinned: ['pin', 'own', ROOT_WORKSPACE_ID],
    recent: ['recent', 'pin', ROOT_WORKSPACE_ID],
    record: vi.fn(),
    togglePin: vi.fn(),
  };
}

function renderPicker(
  overrides: Partial<Parameters<typeof WorkspacePickerDialog>[0]> = {}
) {
  const props = {
    currentId: 'pin',
    defaultId: 'other',
    onOpenChange: vi.fn(),
    onSelect: vi.fn(),
    onCreate: vi.fn(),
    onJoin: vi.fn(),
    onDefault: vi.fn(),
    open: true,
    preferences: prefs(),
    trigger: <button type="button">Open picker</button>,
    visibility: visibility(),
    workspaces: ALL,
    ...overrides,
  };
  return { ...render(<WorkspacePickerDialog {...props} />), props };
}

const row = (id: string) => screen.getByTestId(`workspace-picker-row-${id}`);
const choices = () =>
  Array.from(document.querySelectorAll<HTMLElement>('[data-workspace-choice]'));
const choiceIds = () => choices().map((item) => item.dataset.workspaceId);
// Whitespace-insensitive grid template, as the style engine may reformat it.
const columns = (value: HTMLElement | string) =>
  (typeof value === 'string' ? value : value.style.gridTemplateColumns).replace(
    /\s+/g,
    ''
  );
const cell = (id: string, name: string) =>
  row(id).querySelector<HTMLElement>(`:scope > [data-picker-cell="${name}"]`);

function mockSheetViewport() {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => ({
      matches: true,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
}

afterEach(() => {
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('WorkspacePickerDialog sections', () => {
  it('orders Personal, Internal, Pinned, Recent, Workspaces, then Hidden', () => {
    renderPicker();
    const dialog = screen.getByTestId('workspace-picker-dialog');
    expect(dialog).toHaveAttribute('data-variant', 'dialog');
    expect(dialog).toHaveAccessibleName('select_workspace');
    const sections = [
      'personal',
      'internal',
      'pinned',
      'recent',
      'all',
      'hidden',
    ].map((id) => screen.getByTestId(`workspace-picker-section-${id}`));
    for (let index = 1; index < sections.length; index += 1) {
      expect(
        sections[index - 1]!.compareDocumentPosition(sections[index]!) &
          Node.DOCUMENT_POSITION_FOLLOWING
      ).toBeTruthy();
    }
    expect(sections[0]).toHaveAccessibleName('picker_section_personal');
    expect(sections[1]).toHaveAccessibleName('picker_section_internal');
    expect(sections[4]).toHaveAccessibleName('picker_section_workspaces');
    expect(choiceIds()).toEqual([
      'own',
      ROOT_WORKSPACE_ID,
      'pin',
      'recent',
      'other',
      'guest',
      'long',
    ]);
  });

  it('lists every workspace once and keeps hidden ones out until expanded', () => {
    renderPicker();
    expect(new Set(choiceIds()).size).toBe(choiceIds().length);
    expect(screen.queryByTestId('workspace-picker-row-hidden')).toBeNull();
    const toggle = screen.getByTestId('workspace-picker-hidden-toggle');
    expect(toggle).toHaveTextContent('hidden_workspaces (1)');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(choiceIds().at(-1)).toBe('hidden');
    expect(new Set(choiceIds()).size).toBe(ALL.length);
  });

  it('marks the current workspace and describes states in the row label', () => {
    renderPicker();
    const current = within(row('pin')).getByRole('button', {
      name: /^Pinned studio, PRO, current_workspace, picker_pinned$/,
    });
    expect(current).toHaveAttribute('aria-current', 'true');
    expect(cell('pin', 'state')?.querySelector('svg')).not.toBeNull();
    expect(cell('other', 'state')?.querySelector('svg')).toBeNull();
    expect(
      within(row('other')).getByRole('button', {
        name: 'All hands, PLUS, picker_state_default',
      })
    ).not.toHaveAttribute('aria-current');
    expect(row('own')).toHaveTextContent('picker_personal_meta');
    expect(row(ROOT_WORKSPACE_ID)).toHaveTextContent('picker_internal_meta');
    expect(row('guest')).toHaveTextContent('guest_access');
  });
});

describe('WorkspacePickerDialog row layout', () => {
  it('keeps badge, check and a fixed action column as separate cells in every row', () => {
    renderPicker();
    fireEvent.click(screen.getByTestId('workspace-picker-hidden-toggle'));
    for (const workspace of ALL) {
      const element = row(workspace.id);
      const cells = Array.from(element.children).map((child) =>
        child.getAttribute('data-picker-cell')
      );
      expect(cells).toEqual(['main', 'badge', 'state', 'actions']);
      expect(columns(element)).toBe(columns(pickerRowColumns('dialog')));
      // Personal, Internal, guest and hidden rows offer fewer actions but
      // keep three slots, so the plan badge never moves between rows.
      expect(
        cell(workspace.id, 'actions')?.querySelectorAll('[data-picker-slot]')
      ).toHaveLength(3);
      expect(cell(workspace.id, 'badge')).toHaveTextContent(
        workspace.tier ?? 'FREE'
      );
      expect(
        cell(workspace.id, 'actions')?.contains(cell(workspace.id, 'badge')!)
      ).toBe(false);
      // The choice button holds no nested controls.
      expect(
        cell(workspace.id, 'main')?.querySelectorAll('button, [role="button"]')
      ).toHaveLength(0);
    }
  });

  it('offers only the actions each row supports', () => {
    renderPicker();
    fireEvent.click(screen.getByTestId('workspace-picker-hidden-toggle'));
    const actionNames = (id: string) =>
      within(cell(id, 'actions')!)
        .queryAllByRole('button')
        .map((button) => button.getAttribute('aria-label'));
    expect(actionNames('own')).toEqual([
      'picker_set_default: Personal',
      'hide_workspace: Personal',
    ]);
    expect(actionNames(ROOT_WORKSPACE_ID)).toEqual([
      'picker_set_default: Platform',
      'hide_workspace: Platform',
    ]);
    expect(actionNames('guest')).toEqual([
      'picker_pin: Guest board',
      'hide_workspace: Guest board',
    ]);
    expect(actionNames('hidden')).toEqual(['restore_workspace: Hidden loft']);
  });

  it('keeps a long name in the name cell with its full text available', () => {
    renderPicker();
    const choice = cell('long', 'main')!;
    expect(choice).toHaveAttribute('title', longName.name);
    expect(choice).toHaveAccessibleName(`${longName.name}, ENTERPRISE`);
    expect(cell('long', 'badge')).toHaveTextContent('ENTERPRISE');
    expect(
      cell('long', 'actions')?.querySelectorAll('[data-picker-slot]')
    ).toHaveLength(3);
  });
});

describe('WorkspacePickerDialog row actions', () => {
  it('shows active pin and default states and keeps their semantics', () => {
    const { props } = renderPicker();
    const pin = screen.getByRole('button', {
      name: 'picker_pin: Pinned studio',
    });
    expect(pin).toHaveAttribute('aria-pressed', 'true');
    expect(pin).toHaveAttribute('data-on', 'true');
    const unpinned = screen.getByRole('button', {
      name: 'picker_pin: Recent lab',
    });
    expect(unpinned).toHaveAttribute('aria-pressed', 'false');
    expect(unpinned).not.toHaveAttribute('data-on');
    fireEvent.click(unpinned);
    expect(props.preferences.togglePin).toHaveBeenCalledWith('recent');

    const isDefault = screen.getByRole('button', {
      name: 'default_workspace: All hands',
    });
    expect(isDefault).toHaveAttribute('data-on', 'true');
    expect(isDefault).toBeDisabled();
    fireEvent.click(isDefault);
    expect(props.onDefault).not.toHaveBeenCalled();
    fireEvent.click(
      screen.getByRole('button', { name: 'picker_set_default: Recent lab' })
    );
    expect(props.onDefault).toHaveBeenCalledWith('recent');
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('hides and restores without selecting, and waits while pending', () => {
    const vis = visibility({ pending: new Set(['other']) });
    const { props } = renderPicker({ visibility: vis });
    fireEvent.click(
      screen.getByRole('button', { name: 'hide_workspace: Recent lab' })
    );
    expect(vis.setHidden).toHaveBeenCalledWith('recent', true);
    expect(
      screen.getByRole('button', { name: 'hide_workspace: All hands' })
    ).toBeDisabled();
    fireEvent.click(screen.getByTestId('workspace-picker-hidden-toggle'));
    fireEvent.click(
      screen.getByRole('button', { name: 'restore_workspace: Hidden loft' })
    );
    expect(vis.setHidden).toHaveBeenCalledWith('hidden', false);
    expect(props.onSelect).not.toHaveBeenCalled();
  });

  it('records history and selects through the row choice', () => {
    const { props } = renderPicker();
    fireEvent.click(cell('recent', 'main')!);
    expect(props.preferences.record).toHaveBeenCalledWith('recent');
    expect(props.onSelect).toHaveBeenCalledWith(recent);
  });
});

describe('WorkspacePickerDialog keyboard', () => {
  it('moves through rows, into row actions and selects from search', () => {
    const { props } = renderPicker();
    const search = screen.getByTestId('workspace-picker-search');
    search.focus();
    fireEvent.keyDown(search, { key: 'Home' });
    expect(document.activeElement).toBe(search);
    fireEvent.keyDown(search, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cell('own', 'main'));
    expect(cell('own', 'main')).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cell(ROOT_WORKSPACE_ID, 'main'));
    expect(cell('own', 'main')).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    expect(document.activeElement).toHaveAccessibleName(
      'picker_set_default: Platform'
    );
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowLeft' });
    expect(document.activeElement).toBe(cell(ROOT_WORKSPACE_ID, 'main'));
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement).toBe(cell('long', 'main'));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cell('own', 'main'));
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(cell('long', 'main'));
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(props.onSelect).toHaveBeenCalledWith(longName);
    expect(props.preferences.record).toHaveBeenCalledWith('long');
  });

  it('selects the first match when Enter is pressed after searching', () => {
    const { props } = renderPicker();
    const search = screen.getByTestId('workspace-picker-search');
    fireEvent.change(search, { target: { value: 'lab' } });
    expect(choiceIds()).toEqual(['recent']);
    fireEvent.keyDown(search, { key: 'Enter' });
    expect(props.onSelect).toHaveBeenCalledWith(recent);
  });
});

describe('WorkspacePickerDialog compact sheet', () => {
  it('uses one 44px More menu per row and keeps states on the meta line', async () => {
    mockSheetViewport();
    const { props } = renderPicker();
    expect(screen.getByTestId('workspace-picker-dialog')).toHaveAttribute(
      'data-variant',
      'sheet'
    );
    for (const id of ['own', 'pin', 'long']) {
      expect(columns(row(id))).toBe(columns(pickerRowColumns('sheet')));
      const buttons = within(cell(id, 'actions')!).getAllByRole('button');
      expect(buttons).toHaveLength(1);
      expect(buttons[0]).toHaveAttribute('aria-haspopup', 'menu');
    }
    expect(row('pin')).toHaveTextContent('picker_pinned');
    expect(row('other')).toHaveTextContent('picker_state_default');

    const more = screen.getByRole('button', {
      name: 'picker_more_actions: Personal',
    });
    fireEvent.keyDown(more, { key: 'Enter' });
    const menu = screen.getByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent)
    ).toEqual(['picker_set_default', 'hide_workspace']);
    fireEvent.click(
      within(menu).getByRole('menuitem', { name: 'picker_set_default' })
    );
    expect(props.onDefault).toHaveBeenCalledWith('own');
    expect(props.onSelect).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('menu')).toBeNull());
  });
});

describe('WorkspacePickerDialog states', () => {
  it('shows invitations only when some are pending', () => {
    const { rerender, props } = renderPicker({
      invitationCount: 1,
      invitations: <p>Invite Acme</p>,
    });
    expect(
      screen.getByTestId('workspace-picker-section-invitations')
    ).toHaveTextContent('Invite Acme');
    rerender(<WorkspacePickerDialog {...props} invitations={null} />);
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
    expect(choices()).toHaveLength(0);
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
