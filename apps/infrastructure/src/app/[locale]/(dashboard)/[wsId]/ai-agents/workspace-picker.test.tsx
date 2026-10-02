import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WorkspaceVisibilityProvider } from '@tuturuuu/ui/hooks/use-workspace-visibility';
import { ROOT_WORKSPACE_ID } from '@tuturuuu/utils/constants';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AgentForm } from './agent-form';
import { WorkspacePicker } from './workspace-picker';

const mocks = vi.hoisted(() => ({
  hiddenIds: [] as string[],
  listWorkspaces: vi.fn(),
  hidden: vi.fn(),
}));

vi.mock('@tuturuuu/internal-api/users', () => ({
  getCurrentUserHiddenWorkspaces: mocks.hidden,
  updateCurrentUserHiddenWorkspace: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    key === 'workspace.internal' ? 'Internal' : key,
}));

vi.mock('@tuturuuu/internal-api/workspaces', () => ({
  listWorkspaces: (...args: unknown[]) => mocks.listWorkspaces(...args),
}));

beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class ResizeObserver {
      disconnect() {}
      observe() {}
      unobserve() {}
    }
  );
  Element.prototype.scrollIntoView = vi.fn();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

function renderPicker(
  includeInternalWorkspace: boolean,
  defaultValue?: string
) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <WorkspaceVisibilityProvider actorId="synthetic-actor">
        <WorkspacePicker
          id="workspace-id"
          defaultValue={defaultValue}
          includeInternalWorkspace={includeInternalWorkspace}
        />
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
}

describe('WorkspacePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hiddenIds = [];
    mocks.hidden.mockImplementation(async () => ({
      hiddenWorkspaceIds: mocks.hiddenIds,
    }));
    mocks.listWorkspaces.mockResolvedValue([
      {
        avatar_url: null,
        id: 'workspace-1',
        logo_url: null,
        name: 'Team workspace',
        personal: false,
      },
    ]);
  });

  it('hides the root internal option without root-admin opt-in', async () => {
    renderPicker(false);

    fireEvent.click(screen.getByRole('combobox'));

    await waitFor(() => {
      expect(screen.getByText('Team workspace')).toBeInTheDocument();
    });
    expect(screen.queryByText('Internal')).not.toBeInTheDocument();
  });

  it('shows the root internal option when root-admin opt-in is enabled', async () => {
    renderPicker(true);

    fireEvent.click(screen.getByRole('combobox'));

    await waitFor(() => {
      expect(screen.getByText('Internal')).toBeInTheDocument();
    });
    expect(screen.getByText(ROOT_WORKSPACE_ID)).toBeInTheDocument();
  });

  it('reports controlled workspace selection', async () => {
    const onValueChange = vi.fn();
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    render(
      <QueryClientProvider client={queryClient}>
        <WorkspaceVisibilityProvider actorId="synthetic-actor">
          <WorkspacePicker
            id="workspace-id"
            onValueChange={onValueChange}
            value=""
          />
        </WorkspaceVisibilityProvider>
      </QueryClientProvider>
    );

    fireEvent.click(screen.getByRole('combobox'));
    await waitFor(() => {
      expect(screen.getByText('Team workspace')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Team workspace'));

    expect(onValueChange).toHaveBeenCalledWith('workspace-1');
  });
  it('does not reinsert Hidden root through the Internal option', async () => {
    mocks.hiddenIds = [ROOT_WORKSPACE_ID];
    renderPicker(true, ROOT_WORKSPACE_ID);
    fireEvent.click(screen.getByRole('combobox'));
    await screen.findByText('Team workspace');
    expect(screen.queryByText('Internal')).not.toBeInTheDocument();
    expect(
      document.querySelector<HTMLInputElement>('input[name="workspaceId"]')
        ?.value
    ).toBe('');
    expect(
      screen.getByRole('combobox', { name: 'fields.workspace_id' }).textContent
    ).toContain('workspace.select');
    fireEvent.click(screen.getByText('Team workspace'));
    expect(
      document.querySelector<HTMLInputElement>('input[name="workspaceId"]')
        ?.value
    ).toBe('workspace-1');
  });
});

vi.mock('./channel-config-fields', () => ({
  DiscordChannelFields: () => null,
  ZaloChannelFields: () => null,
}));
it('blocks form submission until its selected visible workspace is available', async () => {
  let resolve!: (value: { hiddenWorkspaceIds: string[] }) => void;
  mocks.hidden.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    })
  );
  mocks.listWorkspaces.mockResolvedValue([
    { id: 'workspace-1', name: 'Team workspace' },
  ]);
  const onSubmit = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <WorkspaceVisibilityProvider actorId="synthetic-actor">
        <AgentForm
          includeInternalWorkspace
          isPending={false}
          onSubmit={onSubmit}
        />
      </WorkspaceVisibilityProvider>
    </QueryClientProvider>
  );
  const create = screen.getByRole('button', { name: 'actions.create' });
  expect(create).toBeDisabled();
  fireEvent.submit(create.closest('form')!);
  expect(onSubmit).not.toHaveBeenCalled();
  resolve({ hiddenWorkspaceIds: [ROOT_WORKSPACE_ID] });
  fireEvent.click(screen.getByRole('combobox'));
  await screen.findByText('Team workspace');
  expect(create).toBeDisabled();
  fireEvent.click(screen.getByText('Team workspace'));
  await waitFor(() => expect(create).toBeEnabled());
  fireEvent.submit(create.closest('form')!);
  expect(onSubmit).toHaveBeenCalledTimes(1);
});
