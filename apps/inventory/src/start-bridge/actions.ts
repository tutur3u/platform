import { createServerFn } from '@tanstack/react-start';

export const fetchWorkspaces = createServerFn({ method: 'GET' }).handler(
  async () => {
    const { listInventoryWorkspaces } = await import('./actions.server');
    return listInventoryWorkspaces();
  }
);
