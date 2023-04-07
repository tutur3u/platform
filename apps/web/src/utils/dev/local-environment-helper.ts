import { mutate } from 'swr';

export const setup = async () => {
  await fetch('/api/dev/setup', { method: 'POST' });
  mutate('/api/workspaces');
};
