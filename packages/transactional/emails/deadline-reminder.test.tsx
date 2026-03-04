import { render } from '@react-email/render';
import { describe, expect, it } from 'vitest';
import DeadlineReminderEmail from './deadline-reminder';

describe('deadline-reminder email', () => {
  it('renders the task summary, due window, and call to action', async () => {
    const html = await render(
      DeadlineReminderEmail({
        userName: 'Casey',
        taskName: 'Ship launch checklist',
        boardName: 'Launch Ops',
        workspaceName: 'Northwind',
        dueDate: '2026-03-05T10:00:00.000Z',
        reminderInterval: '1 hour',
        taskUrl: 'https://tuturuuu.com/ws/tasks/123',
      })
    );

    expect(html).toContain('Deadline Reminder');
    expect(html).toContain('Ship launch checklist');
    expect(html).toContain('Due Window');
    expect(html).toContain('Open task');
    expect(html).toContain('Why you received this');
    expect(html).toContain('https://tuturuuu.com/ws/tasks/123');
  });
});
