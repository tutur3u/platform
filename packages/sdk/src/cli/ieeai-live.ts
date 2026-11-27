import {
  handbookRange,
  handbookTimezone,
  readHandbookRows,
} from '@tuturuuu/utils/ieeai-handbook-stats';
import { refreshCliSession } from './auth';
import { DEFAULT_BASE_URL, readCliConfig, writeCliConfig } from './config';

export async function readLiveHandbookStats(from: string, to: string) {
  const range = handbookRange(from, to);
  if (!range) throw new Error('Invalid handbook date range.');

  const config = await readCliConfig();
  let session = config.session;
  if (config.baseUrl !== DEFAULT_BASE_URL || !session?.accessToken) {
    throw new Error('Log in to tuturuuu.com with `ttr login` first.');
  }

  try {
    if (
      session.refreshToken &&
      session.expiresAt &&
      session.expiresAt * 1000 <= Date.now() + 60_000
    ) {
      session = await refreshCliSession({
        baseUrl: DEFAULT_BASE_URL,
        refreshToken: session.refreshToken,
        fetch: (input, init) =>
          fetch(input, {
            ...init,
            redirect: 'error',
            signal: AbortSignal.timeout(8000),
          }),
      });
      await writeCliConfig({ ...config, session });
    }
    const url = new URL('/api/v1/ieeai/handbook/stats', DEFAULT_BASE_URL);
    url.search = range.query;
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
      headers: { Authorization: `Bearer ${session.accessToken}` },
    });
    const rows = await readHandbookRows(response, range);
    return { source: 'live', from, to, timezone: handbookTimezone, rows };
  } catch {
    throw new Error('Unable to read IEEAI handbook stats.');
  }
}
