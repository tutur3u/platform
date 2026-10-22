import * as api14 from '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/drafts/[draftId]/attachments/[attachmentId]/route';
import * as api15 from '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/drafts/[draftId]/attachments/route';
import * as api16 from '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/drafts/[draftId]/route';
import * as api17 from '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/drafts/route';
import * as api18 from '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/folders/[folderId]/route';
import * as api19 from '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/folders/route';
import * as api20 from '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/labels/[labelId]/route';
import * as api21 from '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/labels/route';
import * as api22 from '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/members/[userId]/route';
import * as api23 from '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/members/route';
import * as api24 from '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/attachments/[attachmentId]/route';
import * as api25 from '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/blacklist/route';
import * as api26 from '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/calendar-link/preview/route';
import * as api27 from '../app/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/calendar-link/route';
import type { MailEndpoint } from './api-dispatch';
import { routeParam } from './route-match';
export const mailRoutes1: MailEndpoint[] = [
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/drafts/[draftId]/attachments/[attachmentId]',
    methods: {
      GET: (request, params) =>
        api14.GET(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
            draftId: routeParam(params, 'draftId'),
            attachmentId: routeParam(params, 'attachmentId'),
          }),
        }),
      DELETE: (request, params) =>
        api14.DELETE(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
            draftId: routeParam(params, 'draftId'),
            attachmentId: routeParam(params, 'attachmentId'),
          }),
        }),
    },
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/drafts/[draftId]/attachments',
    methods: {
      POST: (request, params) =>
        api15.POST(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
            draftId: routeParam(params, 'draftId'),
          }),
        }),
    },
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/drafts/[draftId]',
    methods: {
      PATCH: (request, params) =>
        api16.PATCH(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
            draftId: routeParam(params, 'draftId'),
          }),
        }),
      DELETE: (request, params) =>
        api16.DELETE(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
            draftId: routeParam(params, 'draftId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/drafts',
    methods: {
      POST: (request, params) =>
        api17.POST(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
          }),
        }),
    },
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/folders/[folderId]',
    methods: {
      PATCH: (request, params) =>
        api18.PATCH(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
            folderId: routeParam(params, 'folderId'),
          }),
        }),
      DELETE: (request, params) =>
        api18.DELETE(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
            folderId: routeParam(params, 'folderId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/folders',
    methods: {
      POST: (request, params) =>
        api19.POST(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
          }),
        }),
    },
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/labels/[labelId]',
    methods: {
      PATCH: (request, params) =>
        api20.PATCH(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
            labelId: routeParam(params, 'labelId'),
          }),
        }),
      DELETE: (request, params) =>
        api20.DELETE(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
            labelId: routeParam(params, 'labelId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/labels',
    methods: {
      POST: (request, params) =>
        api21.POST(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
          }),
        }),
    },
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/members/[userId]',
    methods: {
      DELETE: (request, params) =>
        api22.DELETE(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
            userId: routeParam(params, 'userId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/members',
    methods: {
      GET: (request, params) =>
        api23.GET(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
          }),
        }),
      POST: (request, params) =>
        api23.POST(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
          }),
        }),
    },
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/attachments/[attachmentId]',
    methods: {
      GET: (request, params) =>
        api24.GET(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
            messageId: routeParam(params, 'messageId'),
            attachmentId: routeParam(params, 'attachmentId'),
          }),
        }),
    },
  },
  {
    pattern:
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/blacklist',
    methods: {
      GET: (request, params) =>
        api25.GET(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
            messageId: routeParam(params, 'messageId'),
          }),
        }),
      POST: (request, params) =>
        api25.POST(request, {
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
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/calendar-link/preview',
    methods: {
      POST: (request, params) =>
        api26.POST(request, {
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
      '/api/v1/workspaces/[wsId]/mail/mailboxes/[mailboxId]/messages/[messageId]/calendar-link',
    methods: {
      GET: (request, params) =>
        api27.GET(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
            messageId: routeParam(params, 'messageId'),
          }),
        }),
      PUT: (request, params) =>
        api27.PUT(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
            messageId: routeParam(params, 'messageId'),
          }),
        }),
      DELETE: (request, params) =>
        api27.DELETE(request, {
          params: Promise.resolve({
            wsId: routeParam(params, 'wsId'),
            mailboxId: routeParam(params, 'mailboxId'),
            messageId: routeParam(params, 'messageId'),
          }),
        }),
    },
  },
];
