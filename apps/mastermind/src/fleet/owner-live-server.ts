import { createServerFn } from '@tanstack/react-start';
import { createFleetClient } from '../native/clients';
import { currentOwner } from '../native/context';

export const openOwnerLiveTicket = createServerFn({ method: 'POST' }).handler(
  () => createFleetClient(currentOwner()).liveTicket()
);
