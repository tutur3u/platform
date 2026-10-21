import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { createClient } from '@supabase/supabase-js';
import { it } from 'vitest';
import {
  assertTerminalRejection,
  terminalRejectionCredentials,
} from './employee-rejection-http-proof';

it('requires terminal rejection evidence even when the user is absent', () => {
  assert.throws(() =>
    assertTerminalRejection({ error: null, data: { user: null } })
  );
  assert.throws(() =>
    assertTerminalRejection({
      error: null,
      data: { user: { id: 'synthetic' } },
    })
  );
  assert.throws(() =>
    assertTerminalRejection({
      error: { status: 503, code: 'validation_failed' },
      data: { user: null },
    })
  );
  assert.throws(() =>
    assertTerminalRejection({
      error: { status: 400, code: 'validation_failed' },
      data: { user: { id: 'synthetic' } },
    })
  );
});

it('real SDK loopback results gate adjudication after exact rejection and deny successful creates', async () => {
  for (const status of [400, 200]) {
    let conflict = false;
    const server = createServer(async (request, response) => {
      let body = '';
      for await (const chunk of request) body += chunk;
      const parsed = JSON.parse(body);
      conflict =
        typeof parsed.password === 'string' &&
        typeof parsed.password_hash === 'string';
      response.writeHead(status, {
        'Content-Type': 'application/json',
        'x-supabase-api-version': '2024-01-01',
      });
      response.end(
        JSON.stringify(
          status === 400
            ? {
                code: 'validation_failed',
                msg: 'Only a password or a password hash should be provided',
              }
            : {
                id: '10000000-0000-4000-8000-000000000001',
                email: 'synthetic@tuturuuu.com',
                app_metadata: {},
                user_metadata: {},
                aud: 'authenticated',
                created_at: new Date().toISOString(),
              }
        )
      );
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    try {
      const client = createClient(
        `http://127.0.0.1:${address.port}`,
        'disposable-key',
        { auth: { persistSession: false, autoRefreshToken: false } }
      );
      const result = await client.auth.admin.createUser({
        email: 'synthetic@tuturuuu.com',
        ...terminalRejectionCredentials,
      });
      assert.equal(conflict, true);
      let adjudicationReached = false;
      const continueToAdjudication = () => {
        assertTerminalRejection(result);
        adjudicationReached = true;
      };
      if (status === 400) {
        continueToAdjudication();
        assert.equal(adjudicationReached, true);
      } else {
        assert.throws(continueToAdjudication);
        assert.equal(adjudicationReached, false);
      }
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve()))
      );
    }
  }
});
