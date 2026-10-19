import type { NextRequest } from 'next/dist/server/web/spec-extension/request';
import type { RouteParams } from './route-match';
export interface Endpoint {
  pattern: string;
  methods: Partial<
    Record<
      string,
      (
        request: NextRequest,
        params: RouteParams
      ) => Response | Promise<Response>
    >
  >;
}
