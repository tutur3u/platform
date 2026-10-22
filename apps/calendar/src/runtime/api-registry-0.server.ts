import '@tanstack/react-start/server-only';
import type { Endpoint } from './api-endpoint';
import { routeParam } from './route-match';
export const calendarEndpoints0: Endpoint[] = [
  {
    pattern: '/api/[wsId]/calendar/auto-schedule',
    methods: {
      GET: async (request, params) =>
        (await import('../app/api/[wsId]/calendar/auto-schedule/route')).GET(
          request,
          { params: Promise.resolve({ wsId: routeParam(params, 'wsId') }) }
        ),
      POST: async (request, params) =>
        (await import('../app/api/[wsId]/calendar/auto-schedule/route')).POST(
          request,
          { params: Promise.resolve({ wsId: routeParam(params, 'wsId') }) }
        ),
    },
  },
  {
    pattern: '/api/auth/logout',
    methods: {
      GET: async () => (await import('../app/api/auth/logout/route')).GET(),
      POST: async () => (await import('../app/api/auth/logout/route')).POST(),
    },
  },
  {
    pattern: '/api/auth/refresh-app-session',
    methods: {
      POST: async (request) =>
        (await import('../app/api/auth/refresh-app-session/route')).POST(
          request
        ),
    },
  },
  {
    pattern: '/api/auth/verify-app-token',
    methods: {
      POST: async (request) =>
        (await import('../app/api/auth/verify-app-token/route')).POST(request),
    },
  },
  {
    pattern: '/api/build-info',
    methods: {
      GET: async () => (await import('../app/api/build-info/route')).GET(),
    },
  },
  {
    pattern: '/api/cron/calendar/provider-sync',
    methods: {
      GET: async (request) =>
        (await import('../app/api/cron/calendar/provider-sync/route')).GET(
          request
        ),
    },
  },
  {
    pattern: '/api/cron/calendar/smart-schedule',
    methods: {
      GET: async (request) =>
        (await import('../app/api/cron/calendar/smart-schedule/route')).GET(
          request
        ),
    },
  },
  {
    pattern: '/api/test-events',
    methods: {
      POST: async (request) =>
        (await import('../app/api/test-events/route')).POST(request),
    },
  },
  {
    pattern: '/api/v1/calendar/audio',
    methods: {
      POST: async (request) =>
        (await import('../app/api/v1/calendar/audio/route')).POST(request, {
          params: Promise.resolve({}),
        }),
    },
  },
  {
    pattern: '/api/v1/calendar/auth/accounts',
    methods: {
      DELETE: async (request) =>
        (await import('../app/api/v1/calendar/auth/accounts/route')).DELETE(
          request
        ),
      GET: async (request) =>
        (await import('../app/api/v1/calendar/auth/accounts/route')).GET(
          request
        ),
    },
  },
  {
    pattern: '/api/v1/calendar/auth/callback',
    methods: {
      GET: async (request) =>
        (await import('../app/api/v1/calendar/auth/callback/route')).GET(
          request
        ),
    },
  },
  {
    pattern: '/api/v1/calendar/auth/fetch',
    methods: {
      GET: async (request) =>
        (await import('../app/api/v1/calendar/auth/fetch/route')).GET(request),
    },
  },
  {
    pattern: '/api/v1/calendar/auth/full-sync',
    methods: {
      POST: async (request) =>
        (await import('../app/api/v1/calendar/auth/full-sync/route')).POST(
          request
        ),
    },
  },
  {
    pattern: '/api/v1/calendar/auth/import-calendars',
    methods: {
      POST: async (request) =>
        (
          await import('../app/api/v1/calendar/auth/import-calendars/route')
        ).POST(request),
    },
  },
  {
    pattern: '/api/v1/calendar/auth/list-calendars',
    methods: {
      GET: async (request) =>
        (await import('../app/api/v1/calendar/auth/list-calendars/route')).GET(
          request
        ),
    },
  },
  {
    pattern: '/api/v1/calendar/auth/microsoft/callback',
    methods: {
      GET: async (request) =>
        (
          await import('../app/api/v1/calendar/auth/microsoft/callback/route')
        ).GET(request),
    },
  },
  {
    pattern: '/api/v1/calendar/auth/microsoft',
    methods: {
      GET: async (request) =>
        (await import('../app/api/v1/calendar/auth/microsoft/route')).GET(
          request
        ),
    },
  },
  {
    pattern: '/api/v1/calendar/auth/provider-calendars',
    methods: {
      GET: async (request) =>
        (
          await import('../app/api/v1/calendar/auth/provider-calendars/route')
        ).GET(request),
    },
  },
  {
    pattern: '/api/v1/calendar/auth',
    methods: {
      GET: async (request) =>
        (await import('../app/api/v1/calendar/auth/route')).GET(request),
    },
  },
];
