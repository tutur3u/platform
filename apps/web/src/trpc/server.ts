import { createCallerFactory, createTRPCContext } from './init';
import { makeQueryClient } from './query';
import { appRouter } from './routers/_app';
// <-- ensure this file cannot be imported from the client

import { createHydrationHelpers } from '@trpc/react-query/rsc';
import { cache } from 'react';
import 'server-only';

// IMPORTANT: Create a stable getter for the query client that
//            will return the same client during the same request.
export const getQueryClient = cache(makeQueryClient);
const caller = createCallerFactory(appRouter)(createTRPCContext);
export const { trpc, HydrateClient } = createHydrationHelpers<typeof appRouter>(
  caller,
  getQueryClient
);
