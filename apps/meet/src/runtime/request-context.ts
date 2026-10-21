import { AsyncLocalStorage } from 'node:async_hooks';
import {
  RequestCookies,
  ResponseCookies,
} from 'next/dist/compiled/@edge-runtime/cookies';
import type { ObserveLoginNavigation } from './login-redirect-diagnostics';
import type { MeetExecutionContext, MeetRuntimeBindings } from './worker-port';

export interface MeetRequestContext {
  request: Request;
  observeLoginNavigation?: ObserveLoginNavigation;
  responseHeaders: Headers;
  waitUntil: (work: Promise<unknown>) => void;
  cloudflare?: { env: MeetRuntimeBindings; ctx: MeetExecutionContext };
}

const requests = new AsyncLocalStorage<MeetRequestContext>();

export function withMeetRequest<T>(
  context: MeetRequestContext,
  run: () => T
): T {
  return requests.run(context, run);
}

export function meetRequest() {
  const context = requests.getStore();
  if (!context) throw new Error('Meet request context is unavailable');
  return context;
}

export async function headers() {
  return new Headers(meetRequest().request.headers);
}

export async function cookies() {
  const context = meetRequest();
  const incoming = new RequestCookies(context.request.headers);
  const outgoing = new ResponseCookies(context.responseHeaders);
  return {
    get: incoming.get.bind(incoming),
    getAll: incoming.getAll.bind(incoming),
    has: incoming.has.bind(incoming),
    toString: incoming.toString.bind(incoming),
    get size() {
      return incoming.size;
    },
    [Symbol.iterator]: incoming[Symbol.iterator].bind(incoming),
    set(...args: Parameters<ResponseCookies['set']>) {
      outgoing.set(...args);
      const name = typeof args[0] === 'string' ? args[0] : args[0].name;
      const cookie = outgoing.get(name);
      if (!cookie) throw new Error('Meet cookie write was not retained');
      incoming.set(cookie.name, cookie.value);
      return outgoing;
    },
    delete(...args: Parameters<ResponseCookies['delete']>) {
      outgoing.delete(...args);
      const cookie = typeof args[0] === 'string' ? args[0] : args[0].name;
      incoming.delete(cookie);
      return outgoing;
    },
  };
}

export async function connection() {
  // Start pages are request-rendered; access outside a request fails closed.
  meetRequest();
}

export function after(task: Promise<unknown> | (() => unknown)) {
  const context = meetRequest();
  context.waitUntil(
    Promise.resolve().then(() => (typeof task === 'function' ? task() : task))
  );
}
