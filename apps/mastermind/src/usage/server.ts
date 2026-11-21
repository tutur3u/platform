import { createServerFn } from '@tanstack/react-start';
import { createFleetClient } from '../native/clients';
import { currentOwner } from '../native/context';

export const loadUsage = createServerFn({ method: 'GET' }).handler(() =>
  createFleetClient(currentOwner()).usage()
);
