import '@tanstack/react-start/server-only';
import type { Endpoint } from './api-endpoint';
import { routeParam } from './route-match';
export const calendarEndpoints1: Endpoint[] = [
  {
    pattern: '/api/v1/calendar/auth/sync',
    methods: {
      DELETE: async (request) =>
        (await import('../app/api/v1/calendar/auth/sync/route')).DELETE(
          request
        ),
      POST: async (request) =>
        (await import('../app/api/v1/calendar/auth/sync/route')).POST(request),
      PUT: async (request) =>
        (await import('../app/api/v1/calendar/auth/sync/route')).PUT(request),
    },
  },
  {
    pattern: '/api/v1/calendar/auth/sync-to-google',
    methods: {
      POST: async (request) =>
        (await import('../app/api/v1/calendar/auth/sync-to-google/route')).POST(
          request
        ),
    },
  },
  {
    pattern: '/api/v1/calendar/auth/tokens',
    methods: {
      DELETE: async (request) =>
        (await import('../app/api/v1/calendar/auth/tokens/route')).DELETE(
          request
        ),
      GET: async (request) =>
        (await import('../app/api/v1/calendar/auth/tokens/route')).GET(request),
    },
  },
  {
    pattern: '/api/v1/calendar/connections',
    methods: {
      DELETE: async (request) =>
        (await import('../app/api/v1/calendar/connections/route')).DELETE(
          request
        ),
      GET: async (request) =>
        (await import('../app/api/v1/calendar/connections/route')).GET(request),
      PATCH: async (request) =>
        (await import('../app/api/v1/calendar/connections/route')).PATCH(
          request
        ),
      POST: async (request) =>
        (await import('../app/api/v1/calendar/connections/route')).POST(
          request
        ),
    },
  },
  {
    pattern: '/api/v1/calendar/events/generate',
    methods: {
      POST: async (request) =>
        (await import('../app/api/v1/calendar/events/generate/route')).POST(
          request
        ),
    },
  },
  {
    pattern: '/api/v1/calendar/image',
    methods: {
      POST: async (request) =>
        (await import('../app/api/v1/calendar/image/route')).POST(request, {
          params: Promise.resolve({}),
        }),
    },
  },
  {
    pattern: '/api/v1/calendar/mock',
    methods: {
      GET: async () =>
        (await import('../app/api/v1/calendar/mock/route')).GET(),
    },
  },
  {
    pattern: '/api/v1/mira/calendar',
    methods: {
      GET: async (request) =>
        (await import('../app/api/v1/mira/calendar/route')).GET(request),
    },
  },
  {
    pattern: '/api/v1/users/calendar-settings',
    methods: {
      GET: async (request) =>
        (await import('../app/api/v1/users/calendar-settings/route')).GET(
          request,
          { params: Promise.resolve({}) }
        ),
      PATCH: async (request) =>
        (await import('../app/api/v1/users/calendar-settings/route')).PATCH(
          request,
          { params: Promise.resolve({}) }
        ),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/ai/credits',
    methods: {
      GET: async (request, params) =>
        (await import('../app/api/v1/workspaces/[wsId]/ai/credits/route')).GET(
          request,
          { params: Promise.resolve({ wsId: routeParam(params, 'wsId') }) }
        ),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/avatar',
    methods: {
      DELETE: async (request, params) =>
        (await import('../app/api/v1/workspaces/[wsId]/avatar/route')).DELETE(
          request,
          { params: Promise.resolve({ wsId: routeParam(params, 'wsId') }) }
        ),
      PATCH: async (request, params) =>
        (await import('../app/api/v1/workspaces/[wsId]/avatar/route')).PATCH(
          request,
          { params: Promise.resolve({ wsId: routeParam(params, 'wsId') }) }
        ),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/avatar/upload-url',
    methods: {
      POST: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/avatar/upload-url/route'
          )
        ).POST(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/calendar/categories/[categoryId]',
    methods: {
      DELETE: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar/categories/[categoryId]/route'
          )
        ).DELETE(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            categoryId: routeParam(params, 'categoryId'),
          }),
        }),
      PATCH: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar/categories/[categoryId]/route'
          )
        ).PATCH(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            categoryId: routeParam(params, 'categoryId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/calendar/categories/reorder',
    methods: {
      PUT: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar/categories/reorder/route'
          )
        ).PUT(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/calendar/categories',
    methods: {
      GET: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar/categories/route'
          )
        ).GET(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
      POST: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar/categories/route'
          )
        ).POST(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/calendar/colors',
    methods: {
      GET: async (request, params) =>
        (
          await import('../app/api/v1/workspaces/[wsId]/calendar/colors/route')
        ).GET(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/calendar/default-source',
    methods: {
      GET: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar/default-source/route'
          )
        ).GET(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
      PATCH: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar/default-source/route'
          )
        ).PATCH(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
    },
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/calendar/events/[eventId]/color-operation',
    methods: {
      DELETE: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar/events/[eventId]/color-operation/route'
          )
        ).DELETE(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            eventId: routeParam(params, 'eventId'),
          }),
        }),
      GET: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar/events/[eventId]/color-operation/route'
          )
        ).GET(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            eventId: routeParam(params, 'eventId'),
          }),
        }),
      POST: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar/events/[eventId]/color-operation/route'
          )
        ).POST(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            eventId: routeParam(params, 'eventId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/calendar/events/[eventId]/link-preview',
    methods: {
      GET: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar/events/[eventId]/link-preview/route'
          )
        ).GET(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            eventId: routeParam(params, 'eventId'),
          }),
        }),
    },
  },
];
