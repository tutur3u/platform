import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TaskInitiativesClient } from './task-initiatives-client';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));
vi.mock('@tuturuuu/internal-api/tasks', () => ({
  // Deliberately no create export: the retained UI must not depend on it.
  listWorkspaceTaskInitiatives: vi.fn(),
  listWorkspaceTaskProjects: vi.fn(),
  updateWorkspaceTaskInitiative: vi.fn(),
  deleteWorkspaceTaskInitiative: vi.fn(),
  linkWorkspaceTaskInitiativeProject: vi.fn(),
  unlinkWorkspaceTaskInitiativeProject: vi.fn(),
}));

afterEach(cleanup);

const existingInitiative = {
  id: 'initiative-1',
  name: 'Existing initiative',
  description: 'Retained strategic outcome',
  status: 'active' as const,
  created_at: '2026-01-01T00:00:00Z',
  creator: { id: 'actor', display_name: 'Owner', avatar_url: null },
  projectsCount: 1,
  linkedProjects: [{ id: 'project-1', name: 'Existing project', status: null }],
};

function renderInitiatives(initialInitiatives: (typeof existingInitiative)[]) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TaskInitiativesClient
        wsId="workspace-1"
        initialInitiatives={initialInitiatives}
      />
    </QueryClientProvider>
  );
}

function expectNoCreateControls() {
  expect(screen.queryByRole('button', { name: /new|create/i })).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.queryByLabelText('Initiative Name')).toBeNull();
}

describe('Initiatives retirement', () => {
  it('keeps existing initiatives and linked project names readable without creation', () => {
    renderInitiatives([existingInitiative]);
    expect(screen.getByText('Existing initiative')).toBeTruthy();
    expect(screen.getByText('Retained strategic outcome')).toBeTruthy();
    expect(screen.getByText('Existing project')).toBeTruthy();
    expect(screen.getByText('Owner')).toBeTruthy();
    expectNoCreateControls();
  });

  it('has no creation entry point or creation prompt in the empty state', () => {
    renderInitiatives([]);
    expect(screen.getByText('No initiatives yet')).toBeTruthy();
    expect(screen.queryByText(/Create your first initiative/)).toBeNull();
    expectNoCreateControls();
  });
});
