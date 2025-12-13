/**
 * @vitest-environment jsdom
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { QuickCreateBoardDialog } from '../quick-create-board-dialog';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/en/ws-1/tasks/boards',
}));

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) =>
    key === 'ws-task-boards.quick_create.default_name' ? 'Tasks' : key,
}));

vi.mock('@tuturuuu/utils/task-helper', () => ({
  useCreateBoardWithTemplate: () => ({
    mutateAsync: vi.fn().mockResolvedValue({ id: 'board-1' }),
    isPending: false,
  }),
}));

describe('QuickCreateBoardDialog', () => {
  it('shows a create dialog with localized default name', () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <QuickCreateBoardDialog wsId="ws-1" openWhenEmpty />
      </QueryClientProvider>
    );

    // The form input is labeled with ws-task-boards.name (translation key in this test)
    const input = screen.getByLabelText(
      'ws-task-boards.name'
    ) as HTMLInputElement;
    expect(input.value).toBe('Tasks');
  });
});
