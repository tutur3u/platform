import { type History, parseHistory } from '../history/build.ts';

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

let pending: Promise<History> | null = null;

/**
 * The full history JSON, fetched once and only on demand (a reader picking a
 * range longer than the build's window). A failure clears the cache so a later
 * pick can retry.
 */
export function loadHistoryOnce(
  url: string,
  fetchImpl: Fetch = (input, init) => fetch(input, init)
): Promise<History> {
  pending ??= fetchImpl(url, { headers: { accept: 'application/json' } })
    .then((response) => {
      if (!response.ok) throw new Error(`history ${response.status}`);
      return response.json();
    })
    .then(parseHistory)
    .catch((error: unknown) => {
      pending = null;
      throw error;
    });
  return pending;
}

export function resetHistoryOnce() {
  pending = null;
}
