import type { Endpoint } from './api-registry';
import { routeParam, type RouteParams } from './route-match';

const apiRecord = () =>
  import('../app/api/meet-record/[wsId]/[meetingId]/route');
const apiRecordProjects = () =>
  import('../app/api/meet-record/[wsId]/[meetingId]/projects/route');
const apiRecordSince = () =>
  import('../app/api/meet-record/[wsId]/[meetingId]/since/route');

const recordParams = (params: RouteParams) => ({
  params: Promise.resolve({
    wsId: routeParam(params, 'wsId'),
    meetingId: routeParam(params, 'meetingId'),
  }),
});

/** Meeting record, Project link and since-last-time endpoints. */
export const meetRecordEndpoints: Endpoint[] = [
  {
    pattern: '/api/meet-record/[wsId]/[meetingId]/projects',
    methods: {
      GET: async (request, params) =>
        (await apiRecordProjects()).GET(request, recordParams(params)),
      POST: async (request, params) =>
        (await apiRecordProjects()).POST(request, recordParams(params)),
      DELETE: async (request, params) =>
        (await apiRecordProjects()).DELETE(request, recordParams(params)),
    },
  },
  {
    pattern: '/api/meet-record/[wsId]/[meetingId]/since',
    methods: {
      GET: async (request, params) =>
        (await apiRecordSince()).GET(request, recordParams(params)),
      POST: async (request, params) =>
        (await apiRecordSince()).POST(request, recordParams(params)),
    },
  },
  {
    pattern: '/api/meet-record/[wsId]/[meetingId]',
    methods: {
      GET: async (request, params) =>
        (await apiRecord()).GET(request, recordParams(params)),
      POST: async (request, params) =>
        (await apiRecord()).POST(request, recordParams(params)),
      PATCH: async (request, params) =>
        (await apiRecord()).PATCH(request, recordParams(params)),
      DELETE: async (request, params) =>
        (await apiRecord()).DELETE(request, recordParams(params)),
    },
  },
];
