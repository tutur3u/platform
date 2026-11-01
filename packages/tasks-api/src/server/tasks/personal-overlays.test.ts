import type { Task } from '@tuturuuu/types/primitives/Task';
import { expect, it } from 'vitest';
import { applyPersonalTaskMetadata } from './personal-overlays';

it('preserves source project identity when applying personal-only projects', () => {
  const projects = [
    {
      id: 'source-project',
      name: 'Platform',
      status: 'active',
      ticket_key: 'PLA',
      ticket_number: 12,
    },
  ];
  const source = { id: 'task', projects } as Task;
  const metadata = {
    labels: [],
    projects: [{ id: 'personal', name: 'Personal', status: 'active' }],
  };
  const result = applyPersonalTaskMetadata(source, metadata);
  expect(result.projects).toEqual(metadata.projects);
  expect(result.ticket_projects).toEqual(projects);
  expect(applyPersonalTaskMetadata(result, metadata).ticket_projects).toEqual(
    projects
  );
});
