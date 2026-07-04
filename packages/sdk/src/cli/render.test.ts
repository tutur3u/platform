import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, renderWhoami, sortTaskResponseForCli } from './render';

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

  it('escapes terminal control characters in task table cells', () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    render(
      {
        tasks: [
          {
            board_name: 'Board\x9b31m',
            id: 'task-1',
            name: 'Name\x1b]52;c;payload\x07\nNext',
            task_lists: { name: 'List\x1b[31m' },
          },
        ],
      },
      { group: 'tasks' }
    );

    const output = write.mock.calls.map(([value]) => String(value)).join('');
    expect(output).toContain('Name\\x1B]52;c;payload\\x07\\nNext');
    expect(output).toContain('List\\x1B[31m');
    expect(output).toContain('Board\\x9B31m');
    expect(output).not.toContain('\x1b]52;c;payload');
    expect(output).not.toContain('\x07');
    expect(output).not.toContain('\x9b31m');
  });

  it('escapes terminal control characters in whoami metadata', () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    renderWhoami({
      baseUrl: 'https://app.tuturuuu.com',
      configPath: '/tmp/ttr',
      currentWorkspace: {
        id: 'workspace-\x1b[32m',
        name: 'Current\x9b31m',
      },
      defaultWorkspace: {
        id: 'default-\x1b]52;c;id\x07',
        name: 'Default\x1b[34m',
      },
      loggedIn: true,
      session: 'active',
      user: {
        display_name: 'Name\x1b]52;c;payload\x07\nNext',
        email: 'person\x1b[31m@example.com',
        id: 'user-\x9b31m',
      },
    });

    const output = write.mock.calls.map(([value]) => String(value)).join('');
    expect(output).toContain('Name\\x1B]52;c;payload\\x07\\nNext');
    expect(output).toContain('person\\x1B[31m@example.com');
    expect(output).toContain('Current\\x9B31m');
    expect(output).toContain('Default\\x1B[34m');
    expect(output).toContain('default-\\x1B]52;c;id\\x07');
    expect(output).not.toContain('\x1b]52;c;payload');
    expect(output).not.toContain('\x1b]52;c;id');
    expect(output).not.toContain('\x9b31m');
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

  it('preserves ranked task search order and renders scores', () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    render(
      {
        tasks: [
          {
            id: 'lower-priority-first',
            name: 'Lower priority but first ranked',
            priority: 'low',
            similarity: 0.4,
          },
          {
            id: 'critical-second',
            name: 'Critical but second ranked',
            priority: 'critical',
            similarity: 0.9,
          },
        ],
      },
      { group: 'tasks', preserveTaskOrder: true, showTaskScore: true }
    );

    const output = write.mock.calls.map(([value]) => String(value)).join('');
    expect(output).toContain('Score');
    expect(output).toContain('40.0%');
    expect(output).toContain('90.0%');
    expect(output.indexOf('Lower priority but first ranked')).toBeLessThan(
      output.indexOf('Critical but second ranked')
    );
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

  it('renders finance transaction dates in the user timezone', () => {
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
        data: [
          {
            id: 'tx-1',
            amount: 150000,
            description: 'Local date transaction',
            taken_at: '2026-05-08T17:00:00.000Z',
            wallet_name: 'Cash',
          },
        ],
      },
      { financeResource: 'transactions', group: 'finance' }
    );

    const output = write.mock.calls.map(([value]) => String(value)).join('');
    expect(output).toMatch(/May 9, 2026|9 May 2026/);
    expect(output).not.toMatch(/May 8, 2026|8 May 2026/);
  });

  it('renders finance wallet checkpoint summaries and interval statuses', () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    render(
      {
        data: [
          {
            actual_balance: 1250,
            checked_at: '2026-06-11T00:00:00.000Z',
            currency: 'USD',
            current_variance: 5,
            id: 'checkpoint-2',
            ledger_balance: 1245,
            original_variance: 5,
            wallet_id: 'wallet-1',
          },
        ],
        intervals: [
          {
            actual_delta: 50,
            end_checked_at: '2026-06-11T00:00:00.000Z',
            interval_variance: 0,
            is_clean: true,
            ledger_delta: 50,
            start_checked_at: '2026-06-01T00:00:00.000Z',
            transaction_count: 2,
          },
        ],
      },
      { financeResource: 'checkpoints', group: 'finance' }
    );

    const output = write.mock.calls.map(([value]) => String(value)).join('');
    expect(output).toContain('Checkpoints');
    expect(output).toContain('Intervals');
    expect(output).toContain('1,250');
    expect(output).toContain('clean');
  });

  it('renders finance checkpoint total summaries', () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    render(
      {
        latest_checkpoints: [
          {
            actual_balance: 100,
            checked_at: '2026-06-11T00:00:00.000Z',
            currency: 'USD',
            current_variance: 2,
            id: 'checkpoint-1',
            ledger_balance: 98,
            original_variance: 2,
            wallet_id: 'wallet-1',
          },
        ],
        totals_by_currency: [
          {
            actual_total: 100,
            checkpoint_count: 1,
            currency: 'USD',
            ledger_total: 98,
            variance_total: 2,
          },
        ],
        wallets: [
          {
            balance: 98,
            currency: 'USD',
            id: 'wallet-1',
            name: 'Cash',
            type: 'STANDARD',
          },
        ],
      },
      { financeResource: 'checkpoint-summary', group: 'finance' }
    );

    const output = write.mock.calls.map(([value]) => String(value)).join('');
    expect(output).toContain('Wallets');
    expect(output).toContain('Latest Checkpoints');
    expect(output).toContain('Totals');
    expect(output).toContain('Cash');
    expect(output).toContain('USD');
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

  it('renders task pagination totals for table output', () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    render(
      {
        pagination: {
          page: 2,
          pageCount: 4,
          total: 19,
        },
        tasks: [
          {
            id: 'task-1',
            name: 'Paginated task',
          },
        ],
      },
      { group: 'tasks' }
    );

    const output = write.mock.calls.map(([value]) => String(value)).join('');
    expect(output).toContain('Page 2/4 | 19 total');
  });

  it('renders task pagination totals in compact output', () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    render(
      {
        pagination: {
          page: 1,
          pageCount: 3,
          total: 11,
        },
        tasks: [
          {
            id: 'task-1',
            name: 'Compact paginated task',
          },
        ],
      },
      { compact: true, group: 'tasks' }
    );

    const output = write.mock.calls.map(([value]) => String(value)).join('');
    expect(output).toContain('Page 1/3 | 11 total');
  });

  it('renders finance pagination totals for table output', () => {
    const write = vi
      .spyOn(process.stdout, 'write')
      .mockImplementation(() => true);

    render(
      {
        data: [
          {
            amount: -150,
            description: 'Lunch',
            id: 'transaction-1',
            taken_at: '2026-05-09T00:00:00.000Z',
          },
        ],
        pagination: {
          page: 2,
          pageCount: 5,
          total: 42,
        },
      },
      { financeResource: 'transactions', group: 'finance' }
    );

    const output = write.mock.calls.map(([value]) => String(value)).join('');
    expect(output).toContain('Page 2/5 | 42 total');
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
