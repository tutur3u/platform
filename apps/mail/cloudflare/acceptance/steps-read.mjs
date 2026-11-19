import assert from 'node:assert/strict';
import { describe, expectStatus, sha256 } from './evidence.mjs';
import { signWebhook } from './fixtures.mjs';
import { passwordSignIn, sessionCookies } from './session.mjs';

const WEBHOOK = '/api/v1/webhooks/mail/cloudflare';
const present = (value, what) => {
  if (value == null)
    throw new Error(`${what} unavailable: an earlier step failed`);
  return value;
};

/** Anonymous gate, login, inbound ingest, inbox, thread, attachment and CID. */
export async function readSteps(h) {
  const { ev, call, jar, cfg, ctx } = h;
  const ws = cfg.wsId;
  const box = (path) =>
    `/api/v1/workspaces/${ws}/mail/mailboxes/${present(ctx.mailboxId, 'mailbox')}${path}`;
  const json = async (response, status, label) => {
    expectStatus(response, status, label);
    return response.json();
  };

  await ev.step('build identity matches the source SHA', async () => {
    const response = await call('/api/build-info', { cookies: false });
    const info = await json(response, 200, 'build-info');
    assert.equal(info.appName, 'mail');
    assert.equal(info.commitHash, cfg.sha, 'bundled commit differs');
    assert.equal(info.environment, cfg.profile);
    return describe(response);
  });

  await ev.step('anonymous page and API are refused', async () => {
    const page = await call(`/en/${ws}/inbox`, { cookies: false });
    expectStatus(page, 307, 'anonymous page');
    const api = await call(`/api/v1/workspaces/${ws}/mail/bootstrap`, {
      cookies: false,
    });
    expectStatus(api, 401, 'anonymous API');
    assert.deepEqual(api.headers.getSetCookie(), []);
    return { pageStatus: page.status, apiStatus: api.status };
  });

  await ev.step(
    'login: Supabase password sign-in, then authenticated page',
    async () => {
      const session = await passwordSignIn(cfg.login);
      for (const [name, value] of sessionCookies(
        cfg.login.supabaseUrl,
        session
      ))
        jar.set(name, value);
      const page = await call(`/en/${ws}/inbox`);
      expectStatus(page, 200, 'authenticated inbox page');
      return { ...describe(page), cookieNames: jar.names() };
    }
  );

  await ev.step('bootstrap lists the fixture mailbox', async () => {
    const response = await call(`/api/v1/workspaces/${ws}/mail/bootstrap`);
    const body = await json(response, 200, 'bootstrap');
    const mailbox = body.mailboxes.find(
      (entry) => entry.address?.toLowerCase() === cfg.mailbox.toLowerCase()
    );
    assert.ok(mailbox, 'fixture mailbox missing from bootstrap');
    ctx.mailboxId = mailbox.id;
    return {
      ...describe(response),
      mailboxCount: body.mailboxes.length,
      effectiveOutboundProvider: mailbox.effectiveOutboundProvider,
    };
  });

  await ev.step(
    'inbound: signed webhook ingests three messages once',
    async () => {
      const post = (body, headers) =>
        call(WEBHOOK, { method: 'POST', raw: body, headers, cookies: false });
      const check = JSON.stringify({
        type: 'domain_check',
        domain: cfg.domain,
        recipient: cfg.mailbox,
      });
      expectStatus(
        await post(check, signWebhook(cfg.ingestSecret, check)),
        200,
        'domain_check'
      );
      const outcomes = {};
      for (const message of h.fixtures) {
        for (const object of message.objects)
          h.s3.put(
            object.bucketName,
            object.objectKey,
            object.bytes,
            object.contentType
          );
        const body = JSON.stringify(message.event);
        const headers = signWebhook(cfg.ingestSecret, body);
        const first = await json(
          await post(body, headers),
          200,
          `ingest ${message.key}`
        );
        assert.equal(
          first.status,
          'imported',
          `${message.key} was not imported`
        );
        const again = await json(
          await post(body, headers),
          200,
          `replay ${message.key}`
        );
        assert.equal(
          again.status,
          'duplicate',
          `${message.key} replay was not deduplicated`
        );
        outcomes[message.key] = `${first.status}/${again.status}`;
      }
      const body = JSON.stringify(h.fixtures[0].event);
      const forged = signWebhook('not-the-ingest-secret', body);
      expectStatus(await post(body, forged), 401, 'forged signature');
      const unsigned = await post(body, { 'content-type': 'application/json' });
      expectStatus(unsigned, 401, 'unsigned webhook');
      return { outcomes, forgedStatus: 401, unsignedStatus: 401 };
    }
  );

  await ev.step('inbox and thread list show the three messages', async () => {
    const list = await json(
      await call(`${box('/messages')}?folder=inbox&pageSize=100`),
      200,
      'inbox'
    );
    for (const message of h.fixtures) {
      const found = list.messages.find(
        (entry) => entry.subject === message.subject
      );
      assert.ok(found, `${message.key} missing from the inbox`);
      message.id = found.id;
      message.threadId = found.threadId;
    }
    const threads = await json(
      await call(`${box('/threads')}?folder=inbox&pageSize=100`),
      200,
      'threads'
    );
    for (const message of h.fixtures)
      assert.ok(
        threads.threads.some((thread) => thread.id === message.threadId),
        `${message.key} thread missing`
      );
    return {
      messageCount: list.messages.length,
      threadCount: threads.threads.length,
    };
  });

  await ev.step('open thread and message detail', async () => {
    const details = {};
    for (const message of h.fixtures) {
      const thread = await json(
        await call(box(`/threads/${present(message.threadId, 'thread')}`)),
        200,
        `thread ${message.key}`
      );
      const detail = thread.messages.find((entry) => entry.id === message.id);
      assert.ok(detail, `${message.key} not in its thread`);
      assert.equal(detail.attachments.length, message.attachments.length);
      message.detail = detail;
      details[message.key] = {
        attachments: detail.attachments.length,
        hasSanitizedHtml: Boolean(detail.sanitizedHtml),
      };
    }
    const single = await json(
      await call(box(`/messages/${h.fixtures[0].id}`)),
      200,
      'message detail'
    );
    assert.equal(single.subject, h.fixtures[0].subject);
    return { details };
  });

  await ev.step('raw source download matches the stored object', async () => {
    const message = h.fixtures[0];
    const response = await call(box(`/messages/${message.id}/source`));
    expectStatus(response, 200, 'source');
    assert.equal(
      sha256(Buffer.from(await response.arrayBuffer())),
      message.rawSha256
    );
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    return describe(response);
  });

  const attachmentHeaders = (response, disposition) => {
    assert.match(
      response.headers.get('content-disposition') ?? '',
      new RegExp(`^${disposition}`, 'u')
    );
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.equal(response.headers.get('accept-ranges'), 'bytes');
    assert.equal(
      response.headers.get('content-security-policy'),
      "sandbox; default-src 'none'; frame-ancestors 'self'"
    );
    assert.equal(response.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.ok(response.headers.get('x-robots-tag'), 'x-robots-tag missing');
  };

  await ev.step('attachment download, hash and ranged read', async () => {
    const message = h.fixtures.find((entry) => entry.key === 'file');
    const attachment = present(message.detail, 'detail').attachments[0];
    const path = box(`/messages/${message.id}/attachments/${attachment.id}`);
    const full = await call(path);
    expectStatus(full, 200, 'attachment');
    attachmentHeaders(full, 'attachment');
    const bytes = Buffer.from(await full.arrayBuffer());
    assert.equal(sha256(bytes), sha256(message.attachments[0].bytes));
    const part = await call(path, { headers: { range: 'bytes=0-9' } });
    expectStatus(part, 206, 'range');
    assert.match(part.headers.get('content-range') ?? '', /^bytes 0-9\//u);
    assert.equal(Buffer.from(await part.arrayBuffer()).length, 10);
    return {
      ...describe(full),
      rangeStatus: part.status,
      sizeBytes: bytes.length,
    };
  });

  await ev.step(
    'inline CID image is served inline with sandbox headers',
    async () => {
      const message = h.fixtures.find((entry) => entry.key === 'cid');
      const attachment = present(message.detail, 'detail').attachments[0];
      assert.equal(attachment.disposition, 'inline');
      assert.ok(attachment.contentId, 'contentId missing on the inline image');
      const path = box(`/messages/${message.id}/attachments/${attachment.id}`);
      const response = await call(`${path}?preview=1`);
      expectStatus(response, 200, 'inline image');
      attachmentHeaders(response, 'inline');
      assert.equal(response.headers.get('content-type'), 'image/png');
      assert.equal(
        sha256(Buffer.from(await response.arrayBuffer())),
        sha256(message.attachments[0].bytes)
      );
      return {
        ...describe(response),
        hasProtectedUrl: Boolean(attachment.protectedUrl),
      };
    }
  );
}
