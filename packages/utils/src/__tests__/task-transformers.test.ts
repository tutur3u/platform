import { describe, expect, it } from 'vitest';
import { transformTaskRecord } from '../task/transformers';

describe('transformTaskRecord', () => {
  it('keeps flat relation arrays from workspace task API responses', () => {
    const transformed = transformTaskRecord({
      id: 'task-1',
      name: 'Task',
      list_id: 'list-1',
      display_number: 1,
      created_at: '2026-01-01T00:00:00.000Z',
      assignees: [{ id: 'user-1', display_name: 'Alice' }],
      labels: [{ id: 'label-1', name: 'Backend', color: '#111111' }],
      projects: [{ id: 'project-1', name: 'Platform', status: 'active' }],
    });

    expect(transformed.assignees).toEqual([
      { id: 'user-1', display_name: 'Alice', user_id: 'user-1' },
    ]);
    expect(transformed.labels).toEqual([
      { id: 'label-1', name: 'Backend', color: '#111111' },
    ]);
    expect(transformed.projects).toEqual([
      { id: 'project-1', name: 'Platform', status: 'active' },
    ]);
  });

  it('normalizes nested relation arrays from supabase join responses', () => {
    const transformed = transformTaskRecord({
      id: 'task-1',
      name: 'Task',
      list_id: 'list-1',
      display_number: 1,
      created_at: '2026-01-01T00:00:00.000Z',
      assignees: [
        {
          user: { id: 'user-1', display_name: 'Alice' },
        },
      ],
      labels: [
        {
          label: { id: 'label-1', name: 'Backend', color: '#111111' },
        },
      ],
      projects: [
        {
          project: { id: 'project-1', name: 'Platform', status: 'active' },
        },
      ],
    });

    expect(transformed.assignees).toEqual([
      { id: 'user-1', display_name: 'Alice', user_id: 'user-1' },
    ]);
    expect(transformed.labels).toEqual([
      { id: 'label-1', name: 'Backend', color: '#111111' },
    ]);
    expect(transformed.projects).toEqual([
      { id: 'project-1', name: 'Platform', status: 'active' },
    ]);
    expect(transformed).toMatchObject({
      is_personal_external: false,
      is_personal_external_default: false,
    });
  });

  it('preserves explicit personal external flags from API responses', () => {
    const transformed = transformTaskRecord({
      id: 'task-1',
      name: 'Task',
      list_id: 'list-1',
      display_number: 1,
      created_at: '2026-01-01T00:00:00.000Z',
      is_personal_external: true,
      is_personal_external_default: true,
    });

    expect(transformed).toMatchObject({
      is_personal_external: true,
      is_personal_external_default: true,
    });
  });
});
