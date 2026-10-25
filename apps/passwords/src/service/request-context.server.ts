import { AsyncLocalStorage } from 'node:async_hooks';
import type { PasswordsServicePort } from './port';

interface RequestContext {
  request: Request;
  service: PasswordsServicePort;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Carries the request-bound service into Start server functions. */
export function withRequestContext<T>(context: RequestContext, work: () => T) {
  return storage.run(context, work);
}

export function passwordsService() {
  const context = storage.getStore();
  if (!context) throw new Error('Passwords request context unavailable');
  return context.service;
}

export function requestLocale() {
  const header = storage.getStore()?.request.headers.get('accept-language');
  return header?.toLowerCase().startsWith('vi') ? 'vi' : 'en';
}
