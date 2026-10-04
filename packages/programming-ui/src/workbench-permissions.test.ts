import { describe, expect, it } from 'vitest';
import { workbenchPermissions } from './workbench-permissions';

describe('authorized workbench controls', () => {
  it('lets owners execute but prevents edits until their room connects', () => {
    expect(workbenchPermissions('owner', 'connecting', false)).toEqual({
      owner: true,
      canExecute: true,
      editable: false,
    });
    expect(workbenchPermissions('owner', 'open', false).editable).toBe(true);
  });
  it('limits editor execution to an explicitly provided shared-session adapter', () => {
    expect(workbenchPermissions('editor', 'open', false)).toEqual({
      owner: false,
      canExecute: false,
      editable: true,
    });
    expect(workbenchPermissions('editor', 'open', true).canExecute).toBe(true);
  });
  it.each(['viewer', undefined, 'unknown'])(
    'keeps %s read only even with an execution adapter',
    (role) => {
      expect(workbenchPermissions(role, 'open', true)).toEqual({
        owner: false,
        canExecute: false,
        editable: false,
      });
    }
  );
  it('prevents stale offline room edits', () => {
    expect(workbenchPermissions('editor', 'offline', true).editable).toBe(
      false
    );
  });
});
