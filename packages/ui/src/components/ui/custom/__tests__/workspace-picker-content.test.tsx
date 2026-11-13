import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import { describe, expect, it, vi } from 'vitest';
import type { useWorkspaceVisibility } from '../../../../hooks/use-workspace-visibility';
import { Dialog } from '../../dialog';
import { Popover, PopoverTrigger } from '../../popover';
import { WorkspacePickerContent } from '../workspace-picker-content';
import { useWorkspacePickerPreferences } from '../use-workspace-picker-preferences';

vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));
vi.mock('../workspace-select-icon', () => ({
  WorkspaceIcon: () => <span aria-hidden="true" />,
}));
const one: InternalApiWorkspaceSummary = {
  id: 'a',
  name: 'Repeated name',
  personal: false,
  avatar_url: null,
  logo_url: null,
  tier: 'PRO',
};
const two: InternalApiWorkspaceSummary = { ...one, id: 'b' };
const other: InternalApiWorkspaceSummary = {
  ...one,
  id: 'z',
  name: 'Another workspace',
};
function visibility(overrides = {}) {
  return {
    known: true,
    hiddenIds: [],
    pending: new Set(),
    isError: false,
    updateError: null,
    setHidden: vi.fn().mockResolvedValue(undefined),
    refetch: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useWorkspaceVisibility>;
}
describe('workspace sheet rendered identities', () => {
  it('keeps floating create and search actions separate from workspace selection', () => {
    const onCreate = vi.fn();
    const onJoin = vi.fn();
    const onSelect = vi.fn();
    render(
      <Dialog open>
        <WorkspacePickerContent
          workspaces={[one]}
          visibility={visibility()}
          onSelect={onSelect}
          onCreate={onCreate}
          onJoin={onJoin}
        />
      </Dialog>
    );
    const create = screen.getByRole('button', {
      name: 'create_workspace_action',
    });
    const search = screen.getByRole('button', { name: 'search_workspace' });
    expect(create.parentElement).toBe(search.parentElement);
    expect(create.parentElement).toHaveClass('absolute');
    fireEvent.click(create);
    fireEvent.click(
      screen.getByRole('button', { name: 'join_workspace_action' })
    );
    expect(onCreate).toHaveBeenCalledOnce();
    expect(onJoin).toHaveBeenCalledOnce();
    expect(onSelect).not.toHaveBeenCalled();
  });
  it('focuses search when opened and clears the current filtered query', async () => {
    render(
      <Dialog open>
        <WorkspacePickerContent
          workspaces={[one, other]}
          visibility={visibility()}
          onSelect={vi.fn()}
        />
      </Dialog>
    );
    fireEvent.click(screen.getByRole('button', { name: 'search_workspace' }));
    const input = screen.getByRole('textbox', { name: 'search_workspace' });
    await waitFor(() => expect(document.activeElement).toBe(input));
    fireEvent.change(input, { target: { value: 'Repeated' } });
    expect(screen.queryByText('Another workspace')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'clear_search' }));
    expect(input).toHaveValue('');
    expect(document.activeElement).toBe(input);
    expect(screen.getByText('Another workspace')).toBeInTheDocument();
  });
  it('provides fullscreen scrollable modal content with trapped focus and Escape close', async () => {
    const onOpenChange = vi.fn();
    render(
      <>
        <input aria-label="Outside picker" />
        <Dialog open onOpenChange={onOpenChange}>
          <WorkspacePickerContent
            workspaces={[one]}
            visibility={visibility()}
            onSelect={vi.fn()}
          />
        </Dialog>
      </>
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('inset-0', 'h-dvh', 'overflow-hidden');
    const row = screen.getByRole('button', { name: 'Repeated name PRO' });
    expect(row.closest('.overflow-y-auto')).not.toBeNull();
    const outside = screen.getByLabelText('Outside picker');
    outside.focus();
    await waitFor(() =>
      expect(dialog.contains(document.activeElement)).toBe(true)
    );
    fireEvent.keyDown(document.activeElement ?? dialog, { key: 'Escape' });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
  it('selects refreshed filtered objects with duplicate names and reordered input', () => {
    const onSelect = vi.fn();
    const state = visibility();
    const { rerender } = render(
      <Dialog open>
        <WorkspacePickerContent
          workspaces={[other, two, one]}
          visibility={state}
          onSelect={onSelect}
        />
      </Dialog>
    );
    fireEvent.click(screen.getByRole('button', { name: 'search_workspace' }));
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'Repeated' },
    });
    expect(screen.queryByText('Another workspace')).toBeNull();
    const updated = { ...two, tier: 'ENTERPRISE' as const };
    rerender(
      <Dialog open>
        <WorkspacePickerContent
          workspaces={[one, other, updated]}
          visibility={state}
          onSelect={onSelect}
        />
      </Dialog>
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Repeated name ENTERPRISE' })
    );
    expect(onSelect).toHaveBeenCalledWith(updated);
  });
  it('restores only the hidden ID without selecting a current/default scope', () => {
    const state = visibility({ hiddenIds: ['b'] });
    const onSelect = vi.fn();
    render(
      <Dialog open>
        <WorkspacePickerContent
          restoreOnly
          workspaces={[one, two, other]}
          visibility={state}
          onSelect={onSelect}
        />
      </Dialog>
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'restore_workspace: Repeated name' })
    );
    expect(state.setHidden).toHaveBeenCalledWith('b', false);
    expect(onSelect).not.toHaveBeenCalled();
    expect(screen.queryByText('Another workspace')).toBeNull();
  });
  it('does not expose unfiltered choices while the private list is unknown', () => {
    render(
      <Dialog open>
        <WorkspacePickerContent
          workspaces={[one, two]}
          visibility={visibility({ known: false, isError: true })}
          onSelect={vi.fn()}
        />
      </Dialog>
    );
    expect(screen.queryByText('Repeated name')).toBeNull();
    expect(screen.getByRole('status').textContent).toBe(
      'hidden_workspaces_load_error'
    );
  });
});

describe('workspace browser dropdown', () => {
  it('keeps search and Hidden recovery in an anchored scrolling dropdown', async () => {
    const onSelect = vi.fn();
    const onDefault = vi.fn();
    const onCreate = vi.fn();
    const state = visibility({ hiddenIds: [other.id] });
    render(
      <Popover defaultOpen>
        <PopoverTrigger>Choose workspace</PopoverTrigger>
        <WorkspacePickerContent
          presentation="dropdown"
          workspaces={[one, other]}
          visibility={state}
          onSelect={onSelect}
          onDefault={onDefault}
          onCreate={onCreate}
        />
      </Popover>
    );
    const dropdown = screen.getByRole('dialog', { name: 'workspaces' });
    expect(dropdown).toHaveAttribute('data-slot', 'popover-content');
    expect(dropdown).not.toHaveClass('inset-0');
    expect(dropdown).not.toHaveClass('h-dvh');
    expect(dropdown).toHaveClass(
      'max-h-[min(32rem,var(--radix-popover-content-available-height))]'
    );
    expect(dropdown).toHaveClass('overflow-hidden', 'flex-col');
    const input = screen.getByRole('textbox', { name: 'search_workspace' });
    const row = screen.getByRole('button', { name: 'Repeated name PRO' });
    expect(row.closest('.overflow-y-auto')).not.toBeNull();
    expect(screen.queryByText('Another workspace')).toBeNull();
    fireEvent.click(row);
    expect(onSelect).toHaveBeenCalledWith(one);
    fireEvent.click(screen.getByRole('button', { name: 'default_workspace' }));
    expect(onDefault).toHaveBeenCalledWith(one.id);
    const create = screen.getByRole('button', {
      name: 'create_workspace_action',
    });
    const createFooter = create.parentElement;
    expect(createFooter).not.toHaveClass('absolute');
    fireEvent.click(create);
    expect(onCreate).toHaveBeenCalledOnce();
    fireEvent.change(input, { target: { value: 'missing' } });
    expect(
      screen.queryByRole('button', { name: 'Repeated name PRO' })
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'hidden_workspaces' }));
    expect(input).toHaveValue('');
    expect(dropdown).toHaveAccessibleName('hidden_workspaces');
    expect(createFooter).toHaveClass('hidden');
    fireEvent.click(
      screen.getByRole('button', {
        name: 'restore_workspace: Another workspace',
      })
    );
    expect(state.setHidden).toHaveBeenCalledWith(other.id, false);
    expect(onSelect).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(dropdown, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

it.each([false, true])(
  'closes its popover with an optional callback: %s',
  async (withCallback) => {
    const onClose = vi.fn();
    render(
      <Popover defaultOpen>
        <PopoverTrigger>Choose workspace</PopoverTrigger>
        <WorkspacePickerContent
          presentation="dropdown"
          workspaces={[one]}
          visibility={visibility()}
          onSelect={vi.fn()}
          onDefault={vi.fn()}
          onClose={withCallback ? onClose : undefined}
        />
      </Popover>
    );
    fireEvent.click(screen.getByRole('button', { name: 'close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(onClose).toHaveBeenCalledTimes(withCallback ? 1 : 0);
  }
);

it('keeps last-known workspaces selectable after a list fetch fails and retries explicitly', () => {
  const onRetryList = vi.fn();
  const onSelect = vi.fn();
  const state = visibility();
  const { rerender } = render(
    <Dialog open>
      <WorkspacePickerContent
        workspaces={[other]}
        visibility={state}
        onSelect={onSelect}
      />
    </Dialog>
  );
  rerender(
    <Dialog open>
      <WorkspacePickerContent
        workspaces={[other]}
        visibility={state}
        onSelect={onSelect}
        listError={new Error('fetch failed')}
        onRetryList={onRetryList}
      />
    </Dialog>
  );
  expect(screen.getByRole('alert')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'retry' }));
  expect(onRetryList).toHaveBeenCalledOnce();
  fireEvent.click(
    screen.getByRole('button', { name: 'Another workspace PRO' })
  );
  expect(onSelect).toHaveBeenCalledWith(other);
});

it('resets pins and recents on A to B to A, including shared workspace IDs', () => {
  const props = { workspaces: [one, other], onSelect: vi.fn() };
  const view = (actorId: string) => (
    <Dialog open>
      <WorkspacePickerContent {...props} visibility={visibility({ actorId })} />
    </Dialog>
  );
  const { rerender } = render(view('actor-a'));
  fireEvent.click(
    screen.getByRole('button', { name: 'picker_pin: Repeated name' })
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Another workspace PRO' })
  );
  expect(screen.getByText(/picker_pinned/)).toBeInTheDocument();
  expect(screen.getByText(/picker_recent/)).toBeInTheDocument();
  rerender(view('actor-b'));
  expect(screen.queryByText(/picker_pinned|picker_recent/)).toBeNull();
  rerender(view('actor-a'));
  expect(screen.queryByText(/picker_pinned|picker_recent/)).toBeNull();
  expect(
    screen.queryByRole('button', { name: 'picker_unpin: Repeated name' })
  ).toBeNull();
});

it('navigates filtered choices with arrows and keeps Home available for editing search', () => {
  render(
    <Dialog open>
      <WorkspacePickerContent
        workspaces={[one, other]}
        visibility={visibility()}
        onSelect={vi.fn()}
      />
    </Dialog>
  );
  const input = screen.getByRole('textbox');
  fireEvent.change(input, { target: { value: 'Repeated' } });
  input.focus();
  fireEvent.keyDown(input, { key: 'Home' });
  expect(document.activeElement).toBe(input);
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  const row = screen.getByRole('button', { name: 'Repeated name PRO' });
  expect(document.activeElement).toBe(row);
  fireEvent.keyDown(row, { key: 'ArrowUp' });
  expect(document.activeElement).toBe(row);
});

it('retains the query during list failure and retries with last-known choices', () => {
  const retry = vi.fn();
  render(
    <Dialog open>
      <WorkspacePickerContent
        workspaces={[one]}
        visibility={visibility()}
        listError={new Error('fixture')}
        onRetryList={retry}
        onSelect={vi.fn()}
      />
    </Dialog>
  );
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'Repeated' },
  });
  expect(
    screen.getByRole('button', { name: 'Repeated name PRO' })
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'retry' }));
  expect(retry).toHaveBeenCalledOnce();
  expect(screen.getByRole('textbox')).toHaveValue('Repeated');
});

it('clears search and restore mode across actor transitions', () => {
  const view = (actorId: string) => (
    <Dialog open>
      <WorkspacePickerContent
        workspaces={[one, other]}
        visibility={visibility({ actorId })}
        onSelect={vi.fn()}
      />
    </Dialog>
  );
  const { rerender } = render(view('actor-a'));
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'private search' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'hidden_workspaces' }));
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'private hidden search' },
  });
  rerender(view('actor-b'));
  expect(screen.getByRole('textbox')).toHaveValue('');
  expect(
    screen.getByRole('button', { name: 'Another workspace PRO' })
  ).toBeInTheDocument();
  rerender(view('actor-a'));
  expect(screen.getByRole('textbox')).toHaveValue('');
  expect(
    screen.getByRole('button', { name: 'Repeated name PRO' })
  ).toBeInTheDocument();
});

it('retains pins and recents when updates share a render and ignores retired actors', () => {
  const { result, rerender } = renderHook(
    ({ actor }) => useWorkspacePickerPreferences(actor),
    {
      initialProps: { actor: 'actor-a' },
    }
  );
  act(() => {
    result.current.togglePin('a');
    result.current.record('b');
  });
  expect(result.current.pinned).toEqual(['a']);
  expect(result.current.recent).toEqual(['b']);
  const retired = result.current;
  rerender({ actor: 'actor-b' });
  act(() => {
    retired.togglePin('private');
    retired.record('private');
  });
  expect(result.current.pinned).toEqual([]);
  expect(result.current.recent).toEqual([]);
  rerender({ actor: 'actor-a' });
  expect(result.current.pinned).toEqual([]);
  expect(result.current.recent).toEqual([]);
});

it('keeps the search field full width with an inset clear action', () => {
  render(
    <Popover defaultOpen>
      <PopoverTrigger>Choose workspace</PopoverTrigger>
      <WorkspacePickerContent
        presentation="dropdown"
        workspaces={[one, other]}
        currentId={one.id}
        visibility={visibility()}
        onSelect={vi.fn()}
      />
    </Popover>
  );
  const input = screen.getByRole('textbox');
  const frame = input.parentElement;
  expect(frame).toHaveClass('relative');
  expect(frame?.children).toHaveLength(1);
  expect(input).toHaveClass('pr-10');
  fireEvent.change(input, { target: { value: 'Repeated' } });
  const clear = screen.getByRole('button', { name: 'clear_search' });
  expect(clear.parentElement).toBe(frame);
  expect(clear).toHaveClass('absolute', 'inset-y-0', 'right-0');
  fireEvent.click(clear);
  expect(input.parentElement).toBe(frame);
  expect(frame?.children).toHaveLength(1);
  expect(document.activeElement).toBe(input);
  input.focus();
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  const row = screen.getByRole('button', {
    name: 'Repeated name PRO current_workspace',
  });
  expect(row.closest('.overflow-y-auto')).not.toBeNull();
  fireEvent.keyDown(document.activeElement!, { key: 'End' });
  expect(document.activeElement).toBe(
    Array.from(document.querySelectorAll('[data-workspace-choice]')).at(-1)
  );
});
