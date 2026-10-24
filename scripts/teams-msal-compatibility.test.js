const assert = require('node:assert/strict');
const { realpathSync } = require('node:fs');
const { createRequire } = require('node:module');
const { dirname, resolve } = require('node:path');
const { test } = require('node:test');

const adapter = createRequire(
  realpathSync(
    resolve(
      __dirname,
      '../packages/ai/node_modules/@chat-adapter/teams/package.json'
    )
  )
);
const teams = createRequire(
  realpathSync(adapter.resolve('@microsoft/teams.apps'))
);
const msal = teams('@azure/msal-node');
const { TokenManager } = teams(
  resolve(dirname(teams.resolve('@microsoft/teams.apps')), 'token-manager.js')
);
const logger = {
  child() {
    return this;
  },
  log() {},
  debug() {},
};
const tenant = '11111111-1111-4111-8111-111111111111';
const credentials = {
  clientId: '22222222-2222-4222-8222-222222222222',
  clientSecret: 'disposable-test-fixture',
  tenantId: tenant,
};

test('Teams resolves the patched MSAL through its own installed ancestry', () => {
  assert.equal(teams('@azure/msal-node/package.json').version, '7.1.1');
});

test('Teams client credentials acquire a token using MSAL with fixture transport', async () => {
  const manager = new TokenManager(credentials, logger);
  const client = manager.getConfidentialClient(credentials, tenant);
  assert.ok(client instanceof msal.ConfidentialClientApplication);
  assert.notEqual(client.config.auth.instanceAware, true);
  const authority = `https://login.microsoftonline.com/${tenant}`;
  const posts = [];
  const token = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ aud: credentials.clientId, exp: 2000000000 })).toString('base64url')}.fixture`;
  client.config.system.networkClient = {
    async sendGetRequestAsync(url) {
      assert.match(url, /^https:\/\/login\.microsoftonline\.com\//);
      return {
        status: 200,
        headers: {},
        body: url.includes('/discovery/instance')
          ? {
              tenant_discovery_endpoint: `${authority}/v2.0/.well-known/openid-configuration`,
              metadata: [
                {
                  preferred_network: 'login.microsoftonline.com',
                  preferred_cache: 'login.microsoftonline.com',
                  aliases: ['login.microsoftonline.com'],
                },
              ],
            }
          : {
              authorization_endpoint: `${authority}/oauth2/v2.0/authorize`,
              token_endpoint: `${authority}/oauth2/v2.0/token`,
              issuer: `${authority}/v2.0`,
              end_session_endpoint: `${authority}/oauth2/v2.0/logout`,
            },
      };
    },
    async sendPostRequestAsync(url, options) {
      assert.equal(url.split('?')[0], `${authority}/oauth2/v2.0/token`);
      posts.push(new URLSearchParams(options.body));
      return {
        status: 200,
        headers: {},
        body: { token_type: 'Bearer', expires_in: 3600, access_token: token },
      };
    },
  };
  const result = await manager.getAppToken(
    'https://graph.microsoft.com/.default',
    tenant
  );
  assert.equal(result.toString(), token);
  assert.equal(posts.length, 1);
  assert.equal(posts[0].get('grant_type'), 'client_credentials');
  assert.equal(posts[0].get('client_id'), credentials.clientId);
  assert.equal(posts[0].get('client_secret'), credentials.clientSecret);
  assert.match(
    posts[0].get('scope'),
    /https:\/\/graph.microsoft.com\/\.default/
  );
  assert.equal(posts[0].has('response_mode'), false);
  assert.equal(posts[0].has('instance_aware'), false);
});

test('MSAL rejects instance-aware confidential clients and auth URL requests', async () => {
  assert.throws(
    () =>
      new msal.ConfidentialClientApplication({
        auth: { ...credentials, instanceAware: true },
      }),
    { errorCode: 'unsupported_cca_instance_aware' }
  );
  const client = new msal.ConfidentialClientApplication({ auth: credentials });
  await assert.rejects(
    client.getAuthCodeUrl({
      scopes: ['User.Read'],
      redirectUri: 'http://localhost',
      extraQueryParameters: { instance_aware: 'true' },
    }),
    { errorCode: 'unsupported_cca_instance_aware' }
  );
});

test('MSAL rejects removed query response mode before interactive network access', async () => {
  const client = new msal.PublicClientApplication({
    auth: { clientId: credentials.clientId },
  });
  await assert.rejects(
    client.acquireTokenInteractive({
      scopes: ['User.Read'],
      responseMode: 'query',
      openBrowser: async () => assert.fail('browser must not open'),
    }),
    { errorCode: 'invalid_response_mode' }
  );
});
