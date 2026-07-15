import '@testing-library/jest-dom';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TaskTemplatesHub } from './task-templates-hub';

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string) => key,
}));

vi.mock('./task-template-client', () => ({
  TaskTemplateClient: ({
    initialTemplates,
    wsId,
  }: {
    initialTemplates: Array<{ name: string }>;
    wsId: string;
  }) => (
    <div data-testid="task-template-tab">
      task templates for {wsId}:{' '}
      {initialTemplates.map((item) => item.name).join(', ')}
    </div>
  ),
}));

vi.mock('./client', () => ({
  default: ({
    initialTemplates,
    templatesBasePath,
    wsId,
  }: {
    initialTemplates: Array<{ name: string }>;
    templatesBasePath: string;
    wsId: string;
  }) => (
    <div data-testid="board-template-tab">
      board templates for {wsId}/{templatesBasePath}:{' '}
      {initialTemplates.map((item) => item.name).join(', ')}
    </div>
  ),
}));

describe('TaskTemplatesHub', () => {
  it('defaults to task templates and keeps board templates available', () => {
    render(
      <TaskTemplatesHub
        boardTemplates={[
          {
            createdAt: '2026-06-29T00:00:00.000Z',
            createdBy: 'user-1',
            description: null,
            id: 'board-template-1',
            isOwner: true,
            name: 'Sprint board',
            sourceBoardId: 'board-1',
            stats: { labels: 0, lists: 1, tasks: 0 },
            updatedAt: '2026-06-29T00:00:00.000Z',
            visibility: 'workspace',
            wsId: 'ws-1',
          },
        ]}
        taskTemplates={[
          {
            archived_at: null,
            assignee_ids: [],
            created_at: '2026-06-29T00:00:00.000Z',
            created_by: 'user-1',
            default_board_id: null,
            default_list_id: null,
            description: null,
            description_yjs_state: null,
            end_date: null,
            estimation_points: null,
            id: 'task-template-1',
            isOwner: true,
            label_ids: [],
            name: 'Bug report',
            priority: null,
            project_ids: [],
            slug: 'bug-report',
            source_task_id: null,
            start_date: null,
            task_name: 'Investigate bug',
            updated_at: '2026-06-29T00:00:00.000Z',
            visibility: 'private',
            ws_id: 'ws-1',
          },
        ]}
        templatesBasePath="tasks/templates"
        wsId="ws-1"
      />
    );

    expect(screen.getByRole('tab', { name: /tabs.tasks/i })).toHaveAttribute(
      'data-state',
      'active'
    );
    expect(screen.getByTestId('task-template-tab')).toHaveTextContent(
      'Bug report'
    );

    const boardTab = screen.getByRole('tab', { name: /tabs.boards/i });
    fireEvent.pointerDown(boardTab);
    fireEvent.mouseDown(boardTab);
    fireEvent.click(boardTab);

    expect(boardTab).toHaveAttribute('data-state', 'active');
    expect(screen.getByTestId('board-template-tab')).toHaveTextContent(
      'Sprint board'
    );
    expect(screen.getByTestId('board-template-tab')).toHaveTextContent(
      'tasks/templates'
    );
  });
});
