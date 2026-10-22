import * as api28 from '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/invitation/route';
import * as api29 from '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/route';
import * as api30 from '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/state/route';
import * as api31 from '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/bulk/route';
import * as api32 from '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/route';
import * as api33 from '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/organization/route';
import * as api34 from '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/read-all/route';
import * as api35 from '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/settings/route';
import * as api36 from '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/threads/[threadId]/route';
import * as api37 from '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/threads/bulk/route';
import * as api38 from '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/threads/route';
import * as api39 from '../app/api/v1/workspaces/[wsId]/mail/route';
import * as api40 from '../app/api/v1/workspaces/[wsId]/mail/send/route';
import type { MailEndpoint } from './api-dispatch';
import { routeParam } from './route-match';
export const mailRoutes2: MailEndpoint[] = [
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/invitation',
    methods: {
      GET: (request, params) =>
        api28.GET(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
            messageId: routeParam(params, 'messageId'),
          }),
        }),
      POST: (request, params) =>
        api28.POST(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
            messageId: routeParam(params, 'messageId'),
          }),
        }),
    },
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]',
    methods: {
      GET: (request, params) =>
        api29.GET(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
            messageId: routeParam(params, 'messageId'),
          }),
        }),
    },
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/state',
    methods: {
      PATCH: (request, params) =>
        api30.PATCH(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
            messageId: routeParam(params, 'messageId'),
          }),
        }),
    },
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/bulk',
    methods: {
      PATCH: (request, params) =>
        api31.PATCH(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages',
    methods: {
      GET: (request, params) =>
        api32.GET(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
          }),
        }),
      POST: (request, params) =>
        api32.POST(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
          }),
        }),
    },
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/organization',
    methods: {
      GET: (request, params) =>
        api33.GET(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/read-all',
    methods: {
      POST: (request, params) =>
        api34.POST(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/settings',
    methods: {
      GET: (request, params) =>
        api35.GET(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
          }),
        }),
      PATCH: (request, params) =>
        api35.PATCH(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
          }),
        }),
    },
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/threads/[threadId]',
    methods: {
      GET: (request, params) =>
        api36.GET(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
            threadId: routeParam(params, 'threadId'),
          }),
        }),
      PATCH: (request, params) =>
        api36.PATCH(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
            threadId: routeParam(params, 'threadId'),
          }),
        }),
    },
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/threads/bulk',
    methods: {
      POST: (request, params) =>
        api37.POST(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/threads',
    methods: {
      GET: (request, params) =>
        api38.GET(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/mail',
    methods: {
      GET: (request, params) =>
        api39.GET(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/mail/send',
    methods: {
      POST: (request, params) =>
        api40.POST(request, {
          params: Promise.resolve({ wsId: routeParam(params, 'wsId') }),
        }),
    },
  },
];
