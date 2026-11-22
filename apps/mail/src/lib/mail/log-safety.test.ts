import { describe, expect, it } from 'vitest';
import { safeErrorFields, safeLogWorkspaceId } from './log-safety';

describe('Mail log safety exports', () => {
  it('sanitizes error fields through the Mail import path', () => {
    expect(
      safeErrorFields({ code: '23505', details: 'private@example.test' })
    ).toEqual({
      code: '23505',
    });
  });

  it('keeps persisted workspace IDs and drops arbitrary route values', () => {
    const workspaceId = '12345678-1234-1234-1234-123456789abc';
    expect(safeLogWorkspaceId(workspaceId)).toBe(workspaceId);
    expect(safeLogWorkspaceId('private@example.test')).toBeUndefined();
    expect(safeLogWorkspaceId(workspaceId + '\n')).toBeUndefined();
  });
});
