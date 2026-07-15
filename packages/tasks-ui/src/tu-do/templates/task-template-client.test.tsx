import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { listWorkspaceTaskTemplates } from './task-template-api';
import { TaskTemplateClient } from './task-template-client';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) =>
    values?.count ? `${key}:${values.count}` : key,
}));

vi.mock('@tuturuuu/internal-api/tasks', () => ({
  listWorkspaceTaskBoards: vi.fn(async () => ({ boards: [] })),
  listWorkspaceTaskLists: vi.fn(async () => ({ lists: [] })),
}));

vi.mock('./task-template-api', () => ({
  createWorkspaceTaskTemplate: vi.fn(),
  deleteWorkspaceTaskTemplate: vi.fn(),
  instantiateWorkspaceTaskTemplate: vi.fn(),
  listWorkspaceTaskTemplates: vi.fn(async () => ({ templates: [] })),
  saveWorkspaceTaskTemplateFromTask: vi.fn(),
}));

function renderWithQueryClient(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        staleTime: 30_000,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
  );
}

describe('TaskTemplateClient', () => {
  it('fetches task templates even when the server shell starts empty', async () => {
    renderWithQueryClient(
      <TaskTemplateClient initialTemplates={[]} wsId="ws-1" />
    );

    await waitFor(() => {
      expect(listWorkspaceTaskTemplates).toHaveBeenCalledWith('ws-1');
    });
  });
});
