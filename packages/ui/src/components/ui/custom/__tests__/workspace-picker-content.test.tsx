import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import { describe, expect, it, vi } from 'vitest';
import type { useWorkspaceVisibility } from '../../../../hooks/use-workspace-visibility';
import { Dialog } from '../../dialog';
import { Popover, PopoverTrigger } from '../../popover';
import { WorkspacePickerContent } from '../workspace-picker-content';

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
    expect(dropdown).not.toHaveClass('inset-0', 'h-dvh');
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
    expect(create.parentElement).not.toHaveClass('absolute');
    fireEvent.click(create);
    expect(onCreate).toHaveBeenCalledOnce();
    fireEvent.change(input, { target: { value: 'missing' } });
    expect(
      screen.queryByRole('button', { name: 'Repeated name PRO' })
    ).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'hidden_workspaces' }));
    expect(input).toHaveValue('');
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
