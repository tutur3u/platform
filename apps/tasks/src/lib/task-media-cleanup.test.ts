import { describe, expect, it, vi } from 'vitest';
import {
  removeUnreferencedTaskMedia,
  taskMediaFilename,
} from './task-media-cleanup';

const filename =
  '1750000000000_11111111-1111-4111-8111-111111111111_clipboard.png';
const path = `22222222-2222-4222-8222-222222222222/task-images/${filename}`;

function adminWithReferences(referenced: boolean) {
  const remove = vi.fn().mockResolvedValue({ error: null });
  const limit = vi.fn().mockResolvedValue({
    data: referenced ? [{ id: 'task' }] : [],
    error: null,
  });
  const admin = {
    from: vi.fn(() => ({
      select: () => ({ ilike: () => ({ limit }) }),
    })),
    storage: { from: () => ({ remove }) },
  };
  return { admin, remove };
}

describe('task media cleanup', () => {
  it('accepts only generated task media paths', () => {
    expect(taskMediaFilename(path)).toBe(filename);
    expect(
      taskMediaFilename(path.replace('task-images', 'invoices'))
    ).toBeNull();
    expect(taskMediaFilename(`${path}/other.png`)).toBeNull();
  });

  it('keeps media referenced by a task or draft', async () => {
    const { admin, remove } = adminWithReferences(true);
    expect(await removeUnreferencedTaskMedia(admin as never, path)).toBe(false);
    expect(remove).not.toHaveBeenCalled();
  });

  it('deletes unreferenced media from workspace storage', async () => {
    const { admin, remove } = adminWithReferences(false);
    expect(await removeUnreferencedTaskMedia(admin as never, path)).toBe(true);
    expect(remove).toHaveBeenCalledWith([path]);
  });
});
