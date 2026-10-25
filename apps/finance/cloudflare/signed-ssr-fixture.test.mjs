import { describe, expect, it } from 'vitest';
import {
  fixtureWorkspaceId,
  signedSsrFixtureResponse,
} from './signed-ssr-fixture.mjs';

const origins = [
  'https://finance.tuturuuu.com',
  'https://finance-staging.tuturuuu.com',
];
const paths = [
  `/api/workspaces/${fixtureWorkspaceId}/transactions?itemsPerPage=10&page=1`,
  `/api/workspaces/${fixtureWorkspaceId}/finance/overview?includeConfidential=true&view=date`,
];

describe('SSR fixture credential destination fence', () => {
  it.each(origins)(
    'admits only the exact configured origin %s',
    (financeOrigin) => {
      for (const path of paths) {
        const calls = [];
        const headers = { authorization: 'Bearer synthetic-session' };
        expect(
          signedSsrFixtureResponse(
            new Request(financeOrigin + path, { headers }),
            calls,
            financeOrigin
          )
        ).toBeInstanceOf(Response);
        expect(calls).toHaveLength(1);
        for (const other of origins.filter(
          (origin) => origin !== financeOrigin
        )) {
          expect(
            signedSsrFixtureResponse(
              new Request(other + path, { headers }),
              calls,
              financeOrigin
            )
          ).toBeNull();
          expect(calls).toHaveLength(1);
        }
        expect(
          signedSsrFixtureResponse(
            new Request(financeOrigin + path),
            calls,
            financeOrigin
          )
        ).toBeNull();
      }
    }
  );
});
