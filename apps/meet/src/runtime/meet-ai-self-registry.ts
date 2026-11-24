import type { Endpoint } from './api-registry';
import { routeParam, type RouteParams } from './route-match';

const apiSelfChoice = () =>
  import('../app/api/meet-ai/[wsId]/[meetingId]/self/choice/route');
const apiSelfMode = () =>
  import('../app/api/meet-ai/[wsId]/[meetingId]/self/mode/route');
const apiSelfOpen = () =>
  import('../app/api/meet-ai/[wsId]/[meetingId]/self/open/route');
const apiSelfRenew = () =>
  import('../app/api/meet-ai/[wsId]/[meetingId]/self/renew/route');
const apiSelfOutbox = () => import('../app/api/meet-ai/self/outbox/route');

const meetingParams = (params: RouteParams) => ({
  params: Promise.resolve({
    wsId: routeParam(params, 'wsId'),
    meetingId: routeParam(params, 'meetingId'),
  }),
});

/**
 * Per-speaker transcription endpoints. The outbox route is static, so the
 * dispatcher's static-first ordering keeps it from matching
 * `/api/meet-ai/[wsId]/[meetingId]`.
 */
export const meetAiSelfEndpoints: Endpoint[] = [
  {
    pattern: '/api/meet-ai/self/outbox',
    methods: {
      POST: async (request) => (await apiSelfOutbox()).POST(request),
    },
  },
  {
    pattern: '/api/meet-ai/[wsId]/[meetingId]/self/choice',
    methods: {
      POST: async (request, params) =>
        (await apiSelfChoice()).POST(request, meetingParams(params)),
    },
  },
  {
    pattern: '/api/meet-ai/[wsId]/[meetingId]/self/mode',
    methods: {
      POST: async (request, params) =>
        (await apiSelfMode()).POST(request, meetingParams(params)),
    },
  },
  {
    pattern: '/api/meet-ai/[wsId]/[meetingId]/self/open',
    methods: {
      POST: async (request, params) =>
        (await apiSelfOpen()).POST(request, meetingParams(params)),
    },
  },
  {
    pattern: '/api/meet-ai/[wsId]/[meetingId]/self/renew',
    methods: {
      POST: async (request, params) =>
        (await apiSelfRenew()).POST(request, meetingParams(params)),
    },
  },
];
