import { describe, expect, it } from 'vitest';
import { mailStateFilter } from './search';

describe('mail state scan projection', () => {
  it('does not scan read-only rows for a normal inbox', () => {
    expect(mailStateFilter({ folder: 'inbox' })).toBe(
      'archived_at.not.is.null,trashed_at.not.is.null'
    );
  });
  it.each(['is:unread', 'is:"read"'])('includes read state for %s', (query) => {
    expect(mailStateFilter({ query })).toContain('read_at.not.is.null');
  });
  it('preserves starred search and folder state', () => {
    expect(mailStateFilter({ folder: 'starred' })).toContain(
      'starred_at.not.is.null'
    );
    expect(mailStateFilter({ query: 'is:"starred"' })).toContain(
      'starred_at.not.is.null'
    );
  });
});
