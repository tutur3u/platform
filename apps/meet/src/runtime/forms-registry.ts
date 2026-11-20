import type { Endpoint } from './api-registry';
import { routeParam } from './route-match';

const apiForms = () => import('../app/api/meet-call/[meetingId]/forms/route');
const apiFormsCatalog = () =>
  import('../app/api/meet-call/[meetingId]/forms/catalog/route');
const apiFormsPrefill = () =>
  import('../app/api/meet-call/[meetingId]/forms/[launchId]/prefill/route');
const apiFormsSubmit = () =>
  import('../app/api/meet-call/[meetingId]/forms/[launchId]/submit/route');
const apiFormsResults = () =>
  import('../app/api/meet-call/[meetingId]/forms/results/route');
const apiLaunchPublishedForm = () =>
  import('../app/api/meet-call/[meetingId]/forms/published/route');
const apiReadPublishedForm = () =>
  import('../app/api/meet-call/[meetingId]/forms/[launchId]/extended/route');
const apiSubmitPublishedForm = () =>
  import('../app/api/meet-call/[meetingId]/forms/[launchId]/extended/submit/route');
const apiUploadPublishedForm = () =>
  import('../app/api/meet-call/[meetingId]/forms/[launchId]/extended/uploads/route');
const apiDownloadPublishedForm = () =>
  import('../app/api/meet-call/[meetingId]/forms/[launchId]/extended/responses/[responseId]/files/[uploadId]/route');

export const formsEndpoints: Endpoint[] = [
  {
    pattern:
      '/api/meet-call/[meetingId]/forms/[launchId]/extended/responses/[responseId]/files/[uploadId]',
    methods: {
      GET: async (request, params) =>
        (await apiDownloadPublishedForm()).GET(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
            launchId: routeParam(params, 'launchId'),
            responseId: routeParam(params, 'responseId'),
            uploadId: routeParam(params, 'uploadId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/forms',
    methods: {
      GET: async (request, params) =>
        (await apiForms()).GET(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
      POST: async (request, params) =>
        (await apiForms()).POST(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/forms/catalog',
    methods: {
      GET: async (request, params) =>
        (await apiFormsCatalog()).GET(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/forms/[launchId]/prefill',
    methods: {
      POST: async (request, params) =>
        (await apiFormsPrefill()).POST(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
            launchId: routeParam(params, 'launchId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/forms/[launchId]/submit',
    methods: {
      POST: async (request, params) =>
        (await apiFormsSubmit()).POST(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
            launchId: routeParam(params, 'launchId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/forms/results',
    methods: {
      GET: async (request, params) =>
        (await apiFormsResults()).GET(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
      POST: async (request, params) =>
        (await apiFormsResults()).POST(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/forms/published',
    methods: {
      POST: async (request, params) =>
        (await apiLaunchPublishedForm()).POST(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/forms/[launchId]/extended',
    methods: {
      GET: async (request, params) =>
        (await apiReadPublishedForm()).GET(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
            launchId: routeParam(params, 'launchId'),
          }),
        }),
      POST: async (request, params) =>
        (await apiReadPublishedForm()).POST(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
            launchId: routeParam(params, 'launchId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/forms/[launchId]/extended/submit',
    methods: {
      POST: async (request, params) =>
        (await apiSubmitPublishedForm()).POST(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
            launchId: routeParam(params, 'launchId'),
          }),
        }),
    },
  },
  {
    pattern: '/api/meet-call/[meetingId]/forms/[launchId]/extended/uploads',
    methods: {
      POST: async (request, params) =>
        (await apiUploadPublishedForm()).POST(request, {
          params: Promise.resolve({
            meetingId: routeParam(params, 'meetingId'),
            launchId: routeParam(params, 'launchId'),
          }),
        }),
    },
  },
];
