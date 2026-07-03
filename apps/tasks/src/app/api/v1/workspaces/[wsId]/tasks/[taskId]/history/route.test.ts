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
});
