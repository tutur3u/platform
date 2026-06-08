import { baseProcedure, createTRPCRouter } from '../init';

// tRPC router for the web app
// Login authentication uses API routes via @tuturuuu/internal-api.
export const appRouter = createTRPCRouter({
  // Health check procedure to maintain tRPC type system compatibility
  healthCheck: baseProcedure.query(() => {
    return { status: 'ok', timestamp: Date.now() };
  }),
});

// export type definition of API
export type AppRouter = typeof appRouter;
