import { baseProcedure, createTRPCRouter } from '../init';

// tRPC router for the web app
// OTP authentication has been migrated to server actions
// See: apps/web/src/app/[locale]/(marketing)/login/actions.ts
export const appRouter = createTRPCRouter({
  // Health check procedure to maintain tRPC type system compatibility
  healthCheck: baseProcedure.query(() => {
    return { status: 'ok', timestamp: Date.now() };
  }),
});

// export type definition of API
export type AppRouter = typeof appRouter;
