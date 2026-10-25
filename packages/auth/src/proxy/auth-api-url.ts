import type { NextRequest } from 'next/server';
import { withRequestBasePath } from './redirect-path';

export function resolveAuthApiUrl(
  req: NextRequest,
  apiPath: string,
  localPortlessRequest: boolean
) {
  const path = withRequestBasePath(req, apiPath);
  const port = process.env.PORT?.trim();
  const origin =
    process.env.NODE_ENV !== 'production' &&
    port &&
    /^\d+$/u.test(port) &&
    localPortlessRequest
      ? `http://127.0.0.1:${port}`
      : req.url;
  return new URL(path, origin);
}
