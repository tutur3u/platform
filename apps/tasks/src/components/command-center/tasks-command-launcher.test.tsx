import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TasksCommandLauncher } from './tasks-command-launcher';

const launcher = vi.hoisted(() => vi.fn((_props: Record<string, unknown>) => null));

vi.mock('@tuturuuu/satellite/command-launcher', () => ({
  buildCommandLauncherLabels: () => ({ searchHint: 'shared hint' }),
  GlobalCommandLauncher: (props: Record<string, unknown>) => launcher(props),
}));
vi.mock('./task-command-sections', () => ({ TaskCommandSections: () => null }));
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }));

describe('TasksCommandLauncher', () => {
  it('becomes the document center with task-first scope inside the Tasks tree', () => {
    render(
      <TasksCommandLauncher
        isPersonalWorkspace={false}
        navLinks={[{ href: '/ws/tasks', title: 'Boards' }]}
        workspaceSlug="ws"
        wsId="ws-id"
      />
    );
    expect(launcher).toHaveBeenCalledWith(
      expect.objectContaining({
        currentApp: 'tasks',
        currentWorkspaceId: 'ws-id',
        defaultTab: 'tasks',
        enableTasks: true,
        instancePriority: 10,
        labels: expect.objectContaining({
          searchHint: 'task_command.syntax_hint',
        }),
        navItems: [
          expect.objectContaining({ href: '/ws/tasks', title: 'Boards' }),
        ],
      })
    );
  });
});
