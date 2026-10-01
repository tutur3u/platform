import { fireEvent, render, screen } from '@testing-library/react';
import type { InternalApiWorkspaceSummary } from '@tuturuuu/types';
import { describe, expect, it, vi } from 'vitest';
import type { useWorkspaceVisibility } from '../../../../hooks/use-workspace-visibility';
import { Dialog } from '../../dialog';
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
