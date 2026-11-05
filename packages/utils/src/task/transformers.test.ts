import { expect, it } from 'vitest';
import { transformTaskRecord } from './transformers';

it('preserves link identity when expanding nested project records', () => {
  const result = transformTaskRecord({
    id: 'task',
    projects: [
      {
        ticket_number: 12,
        created_at: '2026-01-01',
        project: {
          id: 'project',
          name: 'Platform',
          status: 'active',
          ticket_key: 'PLA',
        },
      },
    ],
  });
  expect(result.projects).toEqual([
    {
      id: 'project',
      name: 'Platform',
      status: 'active',
      ticket_key: 'PLA',
      ticket_number: 12,
      created_at: '2026-01-01',
    },
  ]);
});
