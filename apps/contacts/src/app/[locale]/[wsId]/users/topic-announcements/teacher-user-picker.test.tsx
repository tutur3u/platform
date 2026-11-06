import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeacherUserPicker } from './teacher-user-picker';

const mocks = vi.hoisted(() => ({
  getWorkspaceUser: vi.fn(),
  listWorkspaceBasicUsers: vi.fn(),
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@tuturuuu/internal-api', () => mocks);
vi.mock('@tuturuuu/ui/hooks/use-debounce', () => ({
  useDebounce: (value: string) => [value],
}));

function user(id: string, fullName: string) {
  return { display_name: null, email: null, full_name: fullName, id };
}

function renderPicker(selected = 'none') {
  const onChange = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <TeacherUserPicker
        noneValue="none"
        onChange={onChange}
        selected={selected}
        wsId="workspace-1"
      />
    </QueryClientProvider>
  );
  return onChange;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  );
  Element.prototype.scrollIntoView = vi.fn();
  mocks.listWorkspaceBasicUsers.mockImplementation(
    async (_wsId: string, { q }: { q?: string }) => ({
      count: 1,
      data: q === 'Lan' ? [user('teacher-250', 'Lan Nguyen')] : [],
    })
  );
  mocks.getWorkspaceUser.mockResolvedValue(user('teacher-999', 'Minh Tran'));
});

describe('TeacherUserPicker', () => {
  it('searches the workspace on the server instead of a fixed first page', async () => {
    const onChange = renderPicker();
    fireEvent.click(screen.getByRole('combobox'));
    fireEvent.change(
      screen.getByPlaceholderText('teacher_search_placeholder'),
      { target: { value: 'Lan' } }
    );

    await waitFor(() =>
      expect(mocks.listWorkspaceBasicUsers).toHaveBeenCalledWith(
        'workspace-1',
        expect.objectContaining({ q: 'Lan' })
      )
    );
    fireEvent.click(await screen.findByText('Lan Nguyen'));
    expect(onChange).toHaveBeenCalledWith('teacher-250');
  });

  it('labels a selected teacher that is not in the current results', async () => {
    renderPicker('teacher-999');
    await waitFor(() =>
      expect(mocks.getWorkspaceUser).toHaveBeenCalledWith(
        'workspace-1',
        'teacher-999'
      )
    );
    expect(await screen.findByText('Minh Tran')).toBeInTheDocument();
  });
});
