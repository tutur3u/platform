import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { notificationDisplayCopy } from './display-copy';
import { mailPushPreview } from './mail-push-preview';
import { buildPushData } from './push-delivery';

const notification = {
  id: '10000000-0000-0000-0000-000000000001',
  user_id: '20000000-0000-0000-0000-000000000001',
  ws_id: null,
  type: 'mail_received',
  title: '<b>Sender</b> https://example.invalid/reset?token=private',
  description: 'Subject\nhttps://example.invalid/pixel?secret=private',
  entity_type: 'mail_message',
  entity_id: '30000000-0000-0000-0000-000000000001',
  created_at: '2026-10-12T00:00:00Z',
  data: {
    userId: '20000000-0000-0000-0000-000000000001',
    messageId: '30000000-0000-0000-0000-000000000001',
    mailboxId: '40000000-0000-0000-0000-000000000001',
    threadId: '50000000-0000-0000-0000-000000000001',
  },
};
describe('Mail push plain safe previews', () => {
  it('removes HTML, controls and secret-bearing URLs from visible copy and data', () => {
    const copy = notificationDisplayCopy(notification);
    expect(copy).toEqual({
      app: 'Mail',
      title: 'Mail: Sender …',
      body: 'Subject …',
    });
    const data = buildPushData(notification);
    expect(data.title).toBe('Mail: Sender …');
    expect(data.description).toBe('Subject …');
    expect(data.openTarget).toBe('mail');
    expect(JSON.stringify(data)).not.toContain('private');
    expect(data).not.toHaveProperty('image');
  });
  it('removes protocol-relative URL credentials from visible and data payloads', () => {
    const relative = {
      ...notification,
      title: 'Sender //example.invalid/reset?token=private',
      description: 'Subject //example.invalid/pixel?secret=private',
    };
    expect(notificationDisplayCopy(relative)).toEqual({
      app: 'Mail',
      title: 'Mail: Sender …',
      body: 'Subject …',
    });
    expect(JSON.stringify(buildPushData(relative))).not.toContain('private');
  });
  it('leaves no markup delimiters behind for nested or unterminated tags', () => {
    for (const input of [
      '<<b>script>alert(1)',
      '<scr<b>ipt>Hi</scr</b>ipt>',
      'Sender <img src=x',
      'a > b',
    ]) {
      const preview = mailPushPreview(input);
      expect(preview).not.toMatch(/[<>]/u);
    }
    expect(mailPushPreview('<<b>script>Hello')).toBe('scriptHello');
    expect(mailPushPreview('<b>Sender</b> Subject')).toBe('Sender Subject');
  });
  it('preserves other app copy and valid Mail navigation identities', () => {
    expect(
      notificationDisplayCopy({
        type: 'task_updated',
        title: 'Task',
        description: 'https://task.example.invalid',
      }).body
    ).toBe('https://task.example.invalid');
    expect(buildPushData(notification).mailboxId).toBe(
      '40000000-0000-0000-0000-000000000001'
    );
  });
});
