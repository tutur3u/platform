import { describe, expect, it, vi } from 'vitest';
import { readMeetingProjects } from './programming-catalog';

describe('meeting personal project discovery', () => {
  it('returns the current actor catalog', async () => {
    const result = { actorId: 'actor', projects: [] };
    const read = vi.fn(async () => result) as unknown as Parameters<
      typeof readMeetingProjects
    >[1];
    expect(await readMeetingProjects('actor', read)).toBe(result);
  });
  it('rejects a catalog after an account change', async () => {
    const read = vi.fn(async () => ({
      actorId: 'another',
      projects: [{ id: 'private' }],
    })) as unknown as Parameters<typeof readMeetingProjects>[1];
    await expect(readMeetingProjects('actor', read)).rejects.toThrow(
      'programming_actor_changed'
    );
  });
  it('preserves request failures instead of publishing an empty catalog', async () => {
    const read = vi.fn(async () => {
      throw new Error('denied');
    });
    await expect(readMeetingProjects('actor', read)).rejects.toThrow('denied');
  });
});
