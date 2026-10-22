import * as api0 from '../app/api/ai/email-draft/route';
import * as api1 from '../app/api/auth/logout/route';
import * as api2 from '../app/api/auth/refresh-app-session/route';
import * as api3 from '../app/api/auth/verify-app-token/route';
import * as api4 from '../app/api/build-info/route';
import * as api5 from '../app/api/v1/mail/connected/callback/route';
import * as api6 from '../app/api/v1/mail/domains/[domainId]/catch-all/route';
import * as api7 from '../app/api/v1/mail/domains/route';
import * as api8 from '../app/api/v1/webhooks/mail/cloudflare/route';
import * as api9 from '../app/api/v1/webhooks/mail/ses/route';
import * as api10 from '../app/api/v1/workspaces/[wsId]/mail/bootstrap/route';
import * as api11 from '../app/api/v1/workspaces/[wsId]/mail/connected/[[...segments]]/route';
import * as api12 from '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/ai/draft/route';
import * as api13 from '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/ai/labels/route';
import type { MailEndpoint } from './api-dispatch';
import { routeParam, routeSegments } from './route-match';
export const mailRoutes0: MailEndpoint[] = [
  {
    pattern: '/api/ai/email-draft',
    methods: {
      POST: (request, _params) => api0.POST(request),
    },
  },
  {
    pattern: '/api/auth/logout',
    methods: {
      GET: (_request, _params) => api1.GET(),
      POST: (_request, _params) => api1.POST(),
    },
  },
  {
    pattern: '/api/auth/refresh-app-session',
    methods: {
      POST: (request, _params) => api2.POST(request),
    },
  },
  {
    pattern: '/api/auth/verify-app-token',
    methods: {
      POST: (request, _params) => api3.POST(request),
    },
  },
  {
    pattern: '/api/build-info',
    methods: {
      GET: (_request, _params) => api4.GET(),
    },
  },
  {
    pattern: '/api/v1/mail/connected/callback',
    methods: {
      GET: (request, _params) => api5.GET(request),
    },
  },
  {
    pattern: '/api/v1/mail/domains/[domainId]/catch-all',
    methods: {
      GET: (request, params) =>
        api6.GET(request, {
          params: Promise.resolve({ domainId: routeParam(params, 'domainId') }),
        }),
      PATCH: (request, params) =>
        api6.PATCH(request, {
          params: Promise.resolve({ domainId: routeParam(params, 'domainId') }),
        }),
    },
  },
  {
    pattern: '/api/v1/mail/domains',
    methods: {
      GET: (_request, _params) => api7.GET(),
      PUT: (request, _params) => api7.PUT(request),
    },
  },
  {
    pattern: '/api/v1/webhooks/mail/cloudflare',
    methods: {
      POST: (request, _params) => api8.POST(request),
    },
  },
  {
    pattern: '/api/v1/webhooks/mail/ses',
    methods: {
      POST: (request, _params) => api9.POST(request),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/mail/bootstrap',
    methods: {
      GET: (request, params) =>
        api10.GET(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/mail/connected/[[...segments]]',
    methods: {
      GET: (request, params) =>
        api11.GET(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            segments: routeSegments(params, 'segments'),
          }),
        }),
      POST: (request, params) =>
        api11.POST(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            segments: routeSegments(params, 'segments'),
          }),
        }),
      DELETE: (request, params) =>
        api11.DELETE(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            segments: routeSegments(params, 'segments'),
          }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/ai/draft',
    methods: {
      POST: (request, params) =>
        api12.POST(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/ai/labels',
    methods: {
      POST: (request, params) =>
        api13.POST(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
          }),
        }),
    },
  },
];
