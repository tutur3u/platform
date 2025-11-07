import { createTRPCRouter } from '../init';

// tRPC router for the web app
// OTP authentication has been migrated to server actions
// See: apps/web/src/app/[locale]/(marketing)/login/actions.ts
export const appRouter = createTRPCRouter({
  // Add future tRPC procedures here
});

// export type definition of API
export type AppRouter = typeof appRouter;
