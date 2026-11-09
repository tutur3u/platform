import { describe, expect, it } from 'vitest';
import { formatTaskHistoryEntry } from './route';

describe('task history API formatting', () => {
  it('preserves explicit null old and new values', () => {
    const formatted = formatTaskHistoryEntry({
      id: 'history-1',
      task_id: 'task-1',
      changed_by: null,
      changed_at: '2026-06-27T00:00:00.000Z',
      change_type: 'field_updated',
      field_name: 'description',
      old_value: null,
      new_value: null,
      metadata: {},
      user_id: null,
      user_display_name: null,
      user_avatar_url: null,
    });

    expect(formatted).toHaveProperty('old_value', null);
    expect(formatted).toHaveProperty('new_value', null);
  });
  it('never uses the private email fallback returned by the history RPC', () => {
    const entry = {
      id: 'history-2',
      task_id: 'task-1',
      changed_by: 'actor',
      changed_at: '2026-06-27T00:00:00.000Z',
      change_type: 'field_updated',
      field_name: 'name',
      old_value: 'before',
      new_value: 'after',
      metadata: {},
      user_id: 'actor',
      user_display_name: 'private@example.com',
      user_avatar_url: null,
    };
    expect(formatTaskHistoryEntry(entry).user?.name).toBe('Unknown');
    expect(
      formatTaskHistoryEntry(entry, { display_name: 'Public name' }).user?.name
    ).toBe('Public name');
  });
});
