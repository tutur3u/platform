import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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
import { WorkspacePicker } from './workspace-picker';

const mocks = vi.hoisted(() => ({
  listWorkspaces: vi.fn(),
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

function renderPicker(includeInternalWorkspace: boolean) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <WorkspacePicker
        id="workspace-id"
        includeInternalWorkspace={includeInternalWorkspace}
      />
    </QueryClientProvider>
  );
}

describe('WorkspacePicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
