import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { convertV4MiniflareOptions, Miniflare } from 'miniflare';
import { build } from 'vite';
import { mailWorkerBuiltins } from '../../src/runtime/worker-builtins-plugin.ts';
import mailConfig from '../../void.config.ts';

const app = fileURLToPath(new URL('../../', import.meta.url));
const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const appRequire = createRequire(join(app, 'package.json'));
const supabaseHost = 'supabase.example.test';
const recipient = 'recipient@example.test';
const messageId = 'fixture-provider-id';

async function bundleWorker(outDir) {
  await build({
    configFile: false,
    root: app,
    logLevel: 'warn',
    publicDir: false,
    plugins: [
      mailWorkerBuiltins(),
      {
        name: 'mail-send-test-worker-builtins',
        enforce: 'pre',
        resolveId(source) {
          if (source.startsWith('node:')) return { id: source, external: true };
        },
      },
    ],
    resolve: {
      alias: {
        '#secret-env': join(repo, 'packages/supabase/src/next/secret-env.ts'),
        'next/headers': join(app, 'src/runtime/request-context.ts'),
        'server-only': join(
          appRequire.resolve('@tanstack/react-start/package.json'),
          '../dist/esm/server-only.js'
        ),
      },
    },
    environments: { ssr: { keepProcessEnv: true } },
    ssr: {
      target: 'webworker',
      noExternal: true,
      resolve: {
        conditions: [
          'workerd',
          'worker',
          'bun',
          'module',
          'browser',
          'production',
        ],
      },
    },
    build: {
      ssr: fileURLToPath(new URL('./worker.mjs', import.meta.url)),
      outDir,
      emptyOutDir: true,
      minify: false,
      sourcemap: true,
      rolldownOptions: {
        platform: 'neutral',
        output: { entryFileNames: 'worker.mjs' },
      },
    },
  });
}

function sendFixture() {
  const message = { id: 'fixture-message', mailbox_id: 'fixture-mailbox' };
  const mailbox = {
    address: 'sender@example.test',
    domain_id: 'fixture-domain',
    id: message.mailbox_id,
    status: 'active',
    type: 'shared',
  };
  const jobs = [];
  const providerActions = [];
  const unexpectedRequests = [];

  async function outboundService(request) {
    const url = new URL(request.url);
    if (url.hostname === 'email.us-east-1.amazonaws.com') {
      providerActions.push(
        new URLSearchParams(await request.text()).get('Action')
      );
      return new Response(
        `<SendRawEmailResponse xmlns="http://ses.amazonaws.com/doc/2010-12-01/"><SendRawEmailResult><MessageId>${messageId}</MessageId></SendRawEmailResult><ResponseMetadata><RequestId>fixture-request</RequestId></ResponseMetadata></SendRawEmailResponse>`,
        { headers: { 'Content-Type': 'text/xml' } }
      );
    }
    const table = url.pathname.split('/').at(-1);
    const single = request.headers.get('accept')?.includes('object+json');
    const noContent = () => new Response(null, { status: 204 });

    if (url.hostname === supabaseHost) {
      switch (table) {
        case 'mail_mailbox_members':
          return Response.json([{ role: 'owner' }]);
        case 'mail_mailboxes':
          return Response.json(single ? mailbox : [mailbox]);
        case 'mail_domains':
          return Response.json({ outbound_provider: 'ses', status: 'active' });
        case 'mail_threads':
          return Response.json({ id: 'fixture-thread' });
        case 'mail_messages':
          if (request.method !== 'GET')
            Object.assign(message, await request.json());
          if (request.method === 'GET' || url.searchParams.has('select')) {
            return Response.json(single ? message : [message]);
          }
          return noContent();
        case 'mail_outbound_jobs':
          jobs.push(await request.json());
          return request.method === 'POST'
            ? Response.json({ id: 'fixture-job' })
            : noContent();
        case 'workspace_email_credentials':
          return Response.json([
            {
              access_id: 'fixture-access-id',
              access_key: 'fixture-access-key',
              region: 'us-east-1',
              source_email: mailbox.address,
              source_name: 'Fixture Sender',
            },
          ]);
        case 'get_email_block_statuses':
          return Response.json([{ email: recipient, is_blocked: false }]);
        case 'email_audit':
          return request.method === 'POST'
            ? Response.json({ id: 'fixture-audit' })
            : noContent();
        case 'mail_attachments':
        case 'mail_message_labels':
        case 'mail_message_user_state':
        case 'workspace_secrets':
          return Response.json([]);
        case 'mail_labels':
        case 'mail_recipients':
          return request.method === 'GET' ? Response.json([]) : noContent();
      }
    }
    unexpectedRequests.push(`${request.method} ${url.origin}${url.pathname}`);
    return new Response(null, { status: 599 });
  }

  return {
    jobs,
    message,
    outboundService,
    providerActions,
    unexpectedRequests,
  };
}

test('Mail records an SES acceptance from workerd', async () => {
  const scratch = await mkdtemp(join(tmpdir(), 'mail-send-workerd-'));
  let worker;
  try {
    await bundleWorker(scratch);
    const { compatibility_date, compatibility_flags } = mailConfig.cloudflare;
    const fixture = sendFixture();
    worker = new Miniflare(
      convertV4MiniflareOptions({
        name: 'mail-send-runtime-test',
        modules: [{ type: 'ESModule', path: join(scratch, 'worker.mjs') }],
        modulesRoot: scratch,
        compatibilityDate: compatibility_date,
        compatibilityFlags: compatibility_flags,
        bindings: {
          NEXT_PUBLIC_SUPABASE_URL: `https://${supabaseHost}`,
          SUPABASE_SECRET_KEY: 'fixture-service-key',
          SEND_PRODUCTION_EMAIL: 'true',
        },
        host: '127.0.0.1',
        port: 0,
        outboundService: fixture.outboundService,
      })
    );
    const response = await worker.dispatchFetch('https://mail.example.test/', {
      method: 'POST',
    });
    const body = await response.text();
    assert.deepEqual(fixture.unexpectedRequests, []);
    assert.deepEqual(fixture.providerActions, ['SendRawEmail']);
    assert.equal(response.status, 200, body);
    assert.deepEqual(JSON.parse(body), { status: 'sent' });
    assert.equal(fixture.message.provider_message_id, messageId);
    assert.equal(fixture.jobs.length, 2);
    assert.equal(fixture.jobs[0].status, 'sending');
    assert.equal(fixture.jobs[1].status, 'sent');
    assert.equal(fixture.jobs[1].provider_message_id, messageId);
  } finally {
    try {
      await worker?.dispose();
    } finally {
      await rm(scratch, { recursive: true, force: true });
    }
  }
});
