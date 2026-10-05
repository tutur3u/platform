import { describe, expect, it, vi } from 'vitest';
import {
  prepareMeetingProgramming,
  type prepareProgrammingApi,
} from './prepare-programming';

function fixture(selected = false) {
  const calls: string[] = [];
  const api = {
    read: vi.fn(async () => {
      calls.push('read');
      return { selection: selected ? { id: 'existing' } : null };
    }),
    create: vi.fn(async () => {
      calls.push('create');
      return { id: 'blank' };
    }),
    select: vi.fn(async () => {
      calls.push('select');
    }),
  };
  return { api, calls, typed: api as unknown as typeof prepareProgrammingApi };
}
describe('explicit host programming preparation', () => {
  it('reuses the existing room selection without creating or replacing it', async () => {
    const f = fixture(true);
    await prepareMeetingProgramming('meeting', 'Project', f.typed);
    expect(f.calls).toEqual(['read']);
  });
  it('creates a blank runnable Python project before selecting it', async () => {
    const f = fixture();
    await prepareMeetingProgramming('meeting', 'Project', f.typed);
    expect(f.calls).toEqual(['read', 'create', 'select']);
    expect(f.api.create).toHaveBeenCalledWith('meeting', {
      name: 'Project',
      language: 'python',
      empty: true,
    });
    expect(f.api.select).toHaveBeenCalledWith('meeting', {
      kind: 'playground',
      id: 'blank',
      language: 'python',
    });
  });
  it('does not create a project when room admission fails', async () => {
    const f = fixture();
    f.api.read.mockRejectedValue(new Error('denied'));
    await expect(
      prepareMeetingProgramming('meeting', 'Project', f.typed)
    ).rejects.toThrow('denied');
    expect(f.api.create).not.toHaveBeenCalled();
    expect(f.api.select).not.toHaveBeenCalled();
  });
  it('does not change the room selection after a failed creation', async () => {
    const f = fixture();
    f.api.create.mockRejectedValue(new Error('storage unavailable'));
    await expect(
      prepareMeetingProgramming('meeting', 'Project', f.typed)
    ).rejects.toThrow('storage unavailable');
    expect(f.api.select).not.toHaveBeenCalled();
  });
  it('reports selection rejection without claiming the room is ready', async () => {
    const f = fixture();
    f.api.select.mockRejectedValue(new Error('meeting ended'));
    await expect(
      prepareMeetingProgramming('meeting', 'Project', f.typed)
    ).rejects.toThrow('meeting ended');
  });
  it('does not create after the meeting or account scope changed during admission', async () => {
    const f = fixture();
    await expect(
      prepareMeetingProgramming('meeting', 'Project', f.typed, () => false)
    ).rejects.toThrow('programming_actor_changed');
    expect(f.api.create).not.toHaveBeenCalled();
  });
  it('does not select a resource after its preparation scope changed during creation', async () => {
    const f = fixture();
    let current = true;
    f.api.create.mockImplementation(async () => {
      current = false;
      return { id: 'blank' };
    });
    await expect(
      prepareMeetingProgramming('meeting', 'Project', f.typed, () => current)
    ).rejects.toThrow('programming_actor_changed');
    expect(f.api.select).not.toHaveBeenCalled();
  });
});
