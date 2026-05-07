import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, sortTaskResponseForCli } from './render';

describe('CLI rendering', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('renders single task mutation responses as task rows', () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    render(
      {
        task: {
          board_name: 'Tasks',
          display_number: 12,
          id: 'task-1',
          name: 'Add Tuturuuu CLI',
          priority: 'normal',
          task_lists: { name: 'In Progress' },
          ticket_prefix: 'VHP',
        },
      },
      { group: 'tasks' }
    );

    const output = write.mock.calls.map(([value]) => String(value)).join('');
    expect(output).toContain('Tasks');
    expect(output).toContain('VHP-12');
    expect(output).toContain('In Progress');
    expect(output).toContain('Add Tuturuuu CLI');
  });

  it('falls back to task list and board ids when names are absent', () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    render(
      {
        task: {
          board_id: 'board-1',
          id: 'task-1',
          list_id: 'list-1',
          name: 'Add Tuturuuu CLI',
        },
      },
      { group: 'tasks' }
    );

    const output = write.mock.calls.map(([value]) => String(value)).join('');
    expect(output).toContain('board-1');
    expect(output).toContain('list-1');
  });

  it('renders task command success messages without a table', () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    render({ message: 'Task deleted.' }, { group: 'tasks' });

    expect(write).toHaveBeenCalledWith('Task deleted.\n');
  });

  it('orders task lists by priority and due date', () => {
    expect(
      sortTaskResponseForCli({
        tasks: [
          {
            id: 'low-overdue',
            name: 'Low overdue',
            priority: 'low',
            end_date: '2026-05-01T00:00:00.000Z',
          },
          {
            id: 'critical-later',
            name: 'Critical later',
            priority: 'critical',
            end_date: '2026-05-10T00:00:00.000Z',
          },
          {
            id: 'critical-sooner',
            name: 'Critical sooner',
            priority: 'critical',
            end_date: '2026-05-03T00:00:00.000Z',
          },
          {
            id: 'normal-undated',
            name: 'Normal undated',
            priority: 'normal',
          },
        ],
      })
    ).toMatchObject({
      tasks: [
        { id: 'critical-sooner' },
        { id: 'critical-later' },
        { id: 'normal-undated' },
        { id: 'low-overdue' },
      ],
    });
  });

  it('formats task due dates for table output', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-03T12:00:00.000+07:00'));
    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      calendar: 'gregory',
      locale: 'en',
      numberingSystem: 'latn',
      timeZone: 'Asia/Ho_Chi_Minh',
    });
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    render(
      {
        tasks: [
          {
            id: 'task-1',
            name: 'Due tomorrow',
            end_date: '2026-05-04T23:59:59.000+07:00',
          },
          {
            id: 'task-2',
            name: 'Due later',
            end_date: '2026-05-10T23:59:59.000+07:00',
          },
        ],
      },
      { group: 'tasks' }
    );

    const output = write.mock.calls.map(([value]) => String(value)).join('');
    expect(output).toContain('Tomorrow');
    expect(output).toContain('Due tomorrow');
    expect(output).toContain('May 10');
    expect(output).toContain('Due later');
  });

  it('renders configured task list colors in task rows', () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    render(
      {
        tasks: [
          {
            id: 'task-1',
            name: 'Colorful list',
            task_lists: { color: 'GREEN', name: 'Done' },
          },
        ],
      },
      { group: 'tasks' }
    );

    const output = write.mock.calls.map(([value]) => String(value)).join('');
    expect(output).toContain('■ Done');
  });

  it('shows per-task workspace names for mixed workspace task rows', () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    render(
      {
        tasks: [
          {
            board_name: 'Tasks',
            id: 'task-1',
            list_name: 'Upcoming',
            name: 'Personal task',
            workspace_name: 'Personal',
          },
          {
            board_name: 'Engineering',
            id: 'task-2',
            list_name: 'In Progress',
            name: 'Assigned external task',
            source_workspace_name: 'Tuturuuu',
          },
        ],
      },
      { group: 'tasks' }
    );

    const output = write.mock.calls.map(([value]) => String(value)).join('');
    expect(output).toContain('Personal / Tasks');
    expect(output).toContain('Tuturuuu / Engineering');
  });

  it('renders configured colors in task list rows', () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    render(
      {
        lists: [
          {
            color: 'PURPLE',
            id: 'list-1',
            name: 'Upcoming',
            status: 'active',
          },
        ],
      },
      { group: 'lists' }
    );

    const output = write.mock.calls.map(([value]) => String(value)).join('');
    expect(output).toContain('■ Upcoming');
    expect(output).toContain('■ PURPLE');
  });

  it('wraps tables to the available terminal width', () => {
    const columnsDescriptor = Object.getOwnPropertyDescriptor(
      process.stdout,
      'columns'
    );
    Object.defineProperty(process.stdout, 'columns', {
      configurable: true,
      value: 60,
    });
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    try {
      render(
        {
          tasks: [
            {
              board_name: 'Tasks',
              display_number: 86,
              end_date: '2026-05-04T23:59:59.000+07:00',
              id: 'task-1',
              name: 'Show separate FAB for create task projects and task initiatives immediately',
              priority: 'normal',
              task_lists: { name: 'Upcoming' },
              ticket_prefix: 'VHP',
            },
          ],
        },
        { group: 'tasks' }
      );
    } finally {
      if (columnsDescriptor) {
        Object.defineProperty(process.stdout, 'columns', columnsDescriptor);
      } else {
        Reflect.deleteProperty(process.stdout, 'columns');
      }
    }

    const output = write.mock.calls.map(([value]) => String(value)).join('');
    const lines = output.trimEnd().split('\n');
    expect(output).toContain('┌');
    expect(output).toContain('Show');
    expect(output).toContain('immediatel');
    const ansiPattern = new RegExp(['\\u001B', '\\[[0-9;]*m'].join(''), 'g');
    expect(
      lines.every((line) => line.replace(ansiPattern, '').length <= 60)
    ).toBe(true);
  });

  it('keeps task metadata columns readable at the fallback terminal width', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-03T12:00:00.000+07:00'));
    const columnsDescriptor = Object.getOwnPropertyDescriptor(
      process.stdout,
      'columns'
    );
    Object.defineProperty(process.stdout, 'columns', {
      configurable: true,
      value: 120,
    });
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    try {
      render(
        {
          tasks: [
            {
              board_name: 'Tasks',
              display_number: 74,
              end_date: '2026-05-04T23:59:59.000+07:00',
              id: 'task-1',
              name: 'Draft pricings for pharmacy project',
              priority: 'critical',
              task_lists: { color: 'ORANGE', name: 'Upcoming' },
              ticket_prefix: 'VHP',
            },
          ],
        },
        { group: 'tasks' }
      );
    } finally {
      if (columnsDescriptor) {
        Object.defineProperty(process.stdout, 'columns', columnsDescriptor);
      } else {
        Reflect.deleteProperty(process.stdout, 'columns');
      }
    }

    const output = write.mock.calls.map(([value]) => String(value)).join('');
    const ansiPattern = new RegExp(['\\u001B', '\\[[0-9;]*m'].join(''), 'g');
    const strippedOutput = output.replace(ansiPattern, '');
    expect(strippedOutput).toContain('List');
    expect(strippedOutput).toContain('Board');
    expect(strippedOutput).toContain('Status');
    expect(strippedOutput).toContain('Priority');
    expect(strippedOutput).toContain('Upcoming');
    expect(strippedOutput).toContain('Tomorrow');
    expect(
      strippedOutput
        .trimEnd()
        .split('\n')
        .every((line) => line.length <= 120)
    ).toBe(true);
  });
});
