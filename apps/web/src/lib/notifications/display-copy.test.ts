import { describe, expect, it } from 'vitest';
import { notificationDisplayCopy } from './display-copy';

describe('mobile notification display copy', () => {
  it.each([
    ['mail_received', 'Mail: Cloudflare Registrar'],
    ['finance_transaction', 'Finance: Cloudflare Registrar'],
    ['inventory_stock', 'Inventory: Cloudflare Registrar'],
    ['note_shared', 'Notes: Cloudflare Registrar'],
    ['chat_message', 'Chat: Cloudflare Registrar'],
    ['meet_invite', 'Meet: Cloudflare Registrar'],
    ['drive_file', 'Drive: Cloudflare Registrar'],
    ['education_course', 'Education: Cloudflare Registrar'],
    ['cms_content', 'CMS: Cloudflare Registrar'],
    ['crm_contact', 'CRM: Cloudflare Registrar'],
    ['habit_reminder', 'Habits: Cloudflare Registrar'],
    ['timer_finished', 'Timer: Cloudflare Registrar'],
    ['workspace_invite', 'Workspace: Cloudflare Registrar'],
    ['security_alert', 'Security: Cloudflare Registrar'],
  ])('prefixes %s with its app name', (type, expected) => {
    expect(
      notificationDisplayCopy({
        type,
        title: 'Cloudflare Registrar',
        description: '7 Day Domain Expiration Notice',
      })
    ).toMatchObject({ title: expected, body: '7 Day Domain Expiration Notice' });
  });

  it('puts a task item name in the title and its action below', () => {
    expect(
      notificationDisplayCopy({
        type: 'task_mention',
        title: 'Task mentioned',
        description: 'You were mentioned',
        data: { task_name: 'Cook dinner' },
      })
    ).toMatchObject({
      title: 'Task: Cook dinner',
      body: 'Task mentioned · You were mentioned',
    });
  });

  it('does not repeat an existing app prefix', () => {
    expect(
      notificationDisplayCopy({ type: 'mail_received', title: 'Mail: Cloudflare' })
        .title
    ).toBe('Mail: Cloudflare');
  });
});
