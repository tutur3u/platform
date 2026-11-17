import {
  RequestCookies,
  ResponseCookies,
} from 'next/dist/compiled/@edge-runtime/cookies';
import { bridgeRequest } from '../core/request-context';

export async function cookies() {
  const context = bridgeRequest();
  context.cookieJar ??= new RequestCookies(context.cookieSource);
  const incoming = context.cookieJar as RequestCookies;
  const outgoing = new ResponseCookies(context.responseHeaders);
  const store = {
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
      if (!cookie)
        throw new Error('Start bridge cookie write was not retained');
      incoming.set(cookie.name, cookie.value);
      return store;
    },
    delete(...args: Parameters<ResponseCookies['delete']>) {
      outgoing.delete(...args);
      const name = typeof args[0] === 'string' ? args[0] : args[0].name;
      incoming.delete(name);
      return store;
    },
  };
  return store;
}
