import '@tanstack/react-start/server-only';
import type { Endpoint } from './api-endpoint';
import { routeParam } from './route-match';
export const calendarEndpoints2: Endpoint[] = [
  {
    pattern: '/api/v1/workspaces/[wsId]/calendar/events/[eventId]/response',
    methods: {
      POST: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar/events/[eventId]/response/route'
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
    pattern: '/api/v1/workspaces/[wsId]/calendar/events/[eventId]',
    methods: {
      DELETE: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar/events/[eventId]/route'
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
            '../app/api/v1/workspaces/[wsId]/calendar/events/[eventId]/route'
          )
        ).GET(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            eventId: routeParam(params, 'eventId'),
          }),
        }),
      PUT: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar/events/[eventId]/route'
          )
        ).PUT(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            eventId: routeParam(params, 'eventId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/calendar/events',
    methods: {
      GET: async (request, params) =>
        (
          await import('../app/api/v1/workspaces/[wsId]/calendar/events/route')
        ).GET(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
      POST: async (request, params) =>
        (
          await import('../app/api/v1/workspaces/[wsId]/calendar/events/route')
        ).POST(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/calendar/habit-events',
    methods: {
      GET: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar/habit-events/route'
          )
        ).GET(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/calendar/schedulable-tasks',
    methods: {
      GET: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar/schedulable-tasks/route'
          )
        ).GET(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/calendar/schedule/preview',
    methods: {
      POST: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar/schedule/preview/route'
          )
        ).POST(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/calendar/schedule',
    methods: {
      GET: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar/schedule/route'
          )
        ).GET(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
      POST: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar/schedule/route'
          )
        ).POST(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/calendar/series/[seriesId]',
    methods: {
      DELETE: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar/series/[seriesId]/route'
          )
        ).DELETE(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            seriesId: routeParam(params, 'seriesId'),
          }),
        }),
      GET: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar/series/[seriesId]/route'
          )
        ).GET(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            seriesId: routeParam(params, 'seriesId'),
          }),
        }),
      PUT: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar/series/[seriesId]/route'
          )
        ).PUT(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            seriesId: routeParam(params, 'seriesId'),
          }),
        }),
    },
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/calendar/series/provider-operations/[operationId]',
    methods: {
      GET: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar/series/provider-operations/[operationId]/route'
          )
        ).GET(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            operationId: routeParam(params, 'operationId'),
          }),
        }),
      POST: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar/series/provider-operations/[operationId]/route'
          )
        ).POST(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            operationId: routeParam(params, 'operationId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/calendar/series/provider-operations',
    methods: {
      GET: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar/series/provider-operations/route'
          )
        ).GET(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
      POST: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar/series/provider-operations/route'
          )
        ).POST(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/calendar/series',
    methods: {
      GET: async (request, params) =>
        (
          await import('../app/api/v1/workspaces/[wsId]/calendar/series/route')
        ).GET(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
      POST: async (request, params) =>
        (
          await import('../app/api/v1/workspaces/[wsId]/calendar/series/route')
        ).POST(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/calendar/sync',
    methods: {
      POST: async (request, params) =>
        (
          await import('../app/api/v1/workspaces/[wsId]/calendar/sync/route')
        ).POST(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/calendar/sync-preferences',
    methods: {
      GET: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar/sync-preferences/route'
          )
        ).GET(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
      PATCH: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar/sync-preferences/route'
          )
        ).PATCH(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/calendar/sync-status',
    methods: {
      GET: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar/sync-status/route'
          )
        ).GET(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/calendar-hours',
    methods: {
      GET: async (request, params) =>
        (
          await import('../app/api/v1/workspaces/[wsId]/calendar-hours/route')
        ).GET(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
      PATCH: async (request, params) =>
        (
          await import('../app/api/v1/workspaces/[wsId]/calendar-hours/route')
        ).PATCH(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/calendar-settings',
    methods: {
      GET: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar-settings/route'
          )
        ).GET(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
      PATCH: async (request, params) =>
        (
          await import(
            '../app/api/v1/workspaces/[wsId]/calendar-settings/route'
          )
        ).PATCH(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/calendars/reset',
    methods: {
      POST: async (request, params) =>
        (
          await import('../app/api/v1/workspaces/[wsId]/calendars/reset/route')
        ).POST(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/calendars',
    methods: {
      DELETE: async (request, params) =>
        (
          await import('../app/api/v1/workspaces/[wsId]/calendars/route')
        ).DELETE(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
      GET: async (request, params) =>
        (await import('../app/api/v1/workspaces/[wsId]/calendars/route')).GET(
          request,
          { params: Promise.resolve({ wsId: routeParam(params, 'wsId') }) }
        ),
      PATCH: async (request, params) =>
        (await import('../app/api/v1/workspaces/[wsId]/calendars/route')).PATCH(
          request,
          { params: Promise.resolve({ wsId: routeParam(params, 'wsId') }) }
        ),
      POST: async (request, params) =>
        (await import('../app/api/v1/workspaces/[wsId]/calendars/route')).POST(
          request,
          { params: Promise.resolve({ wsId: routeParam(params, 'wsId') }) }
        ),
    },
  },
  {
    pattern: '/api/workspaces/[wsId]',
    methods: {
      GET: async (request, params) =>
        (await import('../app/api/workspaces/[wsId]/route')).GET(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
      PUT: async (request, params) =>
        (await import('../app/api/workspaces/[wsId]/route')).PUT(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
    },
  },
];
