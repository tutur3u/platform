import generated from '../generated/live.json' with { type: 'json' };
import { type LiveData, parseLiveData } from './model.ts';

let snapshot: LiveData | undefined;

/**
 * The build-time snapshot, parsed on first use inside a request.
 *
 * Never parse it at module top level. Cloudflare Workers report
 * Date.now() as 0 while a module evaluates, and route chunks evaluate when
 * they are first imported. parseLiveData would then see the build time as
 * being in the future and throw, which fails the server render
 * (production showed only React's client-render fallback).
 */
export function initialLiveData(): LiveData {
  snapshot ??= parseLiveData(generated);
  return snapshot;
}
