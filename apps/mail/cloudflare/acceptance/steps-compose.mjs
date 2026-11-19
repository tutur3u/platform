import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { describe, expectStatus, sha256 } from './evidence.mjs';
import { PNG_BYTES } from './fixtures.mjs';

const PNG_DATA_URI = `data:image/png;base64,${PNG_BYTES.toString('base64')}`;
const present = (value, what) => {
  if (value == null)
    throw new Error(`${what} unavailable: an earlier step failed`);
  return value;
};

/**
 * Compose, the three paste shapes, send under the inert provider, and the
 * document headers. The paste event handlers run in a browser and are covered
 * by mail-composer-paste.test.ts; these steps drive the server side each paste
 * shape ends in: a draft, uploaded inline or attached files, and the HTML that
 * references them.
 */
export async function composeSteps(h) {
  const { ev, call, cfg, ctx, s3, provider } = h;
  const ws = cfg.wsId;
  const box = (path) =>
    `/api/v1/workspaces/${ws}/mail/mailboxes/${present(ctx.mailboxId, 'mailbox')}${path}`;
  const json = async (response, status, label) => {
    expectStatus(response, status, label);
    return response.json();
  };
  const upload = async (file, fields) => {
    const form = new FormData();
    form.set('file', file);
    form.set('clientAttachmentId', randomUUID());
    for (const [name, value] of Object.entries(fields)) form.set(name, value);
    const body = await json(
      await call(box(`/drafts/${ctx.draftId}/attachments`), {
        method: 'POST',
        form,
      }),
      201,
      `upload ${file.name}`
    );
    return body.attachment;
  };
  const draftUrl = (attachment) =>
    `/api/v1/workspaces/${ws}/mail/mailboxes/${ctx.mailboxId}/drafts/${ctx.draftId}/attachments/${attachment.id}`;

  await ev.step('compose: create a draft', async () => {
    const body = await json(
      await call(box('/drafts'), {
        method: 'POST',
        json: {
          subject: `D394 compose ${cfg.runId}`,
          to: [cfg.recipient],
          bodyText: 'draft body',
          bodyHtml: '<p>draft body</p>',
        },
      }),
      200,
      'create draft'
    );
    assert.equal(body.message.status, 'draft');
    ctx.draftId = body.message.id;
    return { status: 200 };
  });

  await ev.step(
    'paste shapes: image, file and rich HTML with an embedded image',
    async () => {
      present(ctx.draftId, 'draft');
      // Shape 1: a screenshot on the clipboard becomes an inline image.
      const screenshot = await upload(
        new File([PNG_BYTES], 'pasted-image-1.png', { type: 'image/png' }),
        {
          disposition: 'inline',
          contentId: `pasted-1-${cfg.runId}@mail.invalid`,
        }
      );
      // Shape 2: a Finder file on the clipboard becomes an attachment.
      const file = await upload(
        new File([Buffer.from('pasted file\n')], 'notes.txt', {
          type: 'text/plain',
        }),
        { disposition: 'attachment' }
      );
      // Shape 3: rich HTML with a data: image keeps its text and uploads the image.
      const embedded = await upload(
        new File([PNG_BYTES], 'pasted-image-2.png', { type: 'image/png' }),
        {
          disposition: 'inline',
          contentId: `pasted-2-${cfg.runId}@mail.invalid`,
        }
      );
      const richHtml = `<p><strong>Rich</strong> paste</p><img src="${PNG_DATA_URI}">`;
      const bodyHtml = `<p>draft body</p><img src="${draftUrl(screenshot)}">${richHtml.replace(PNG_DATA_URI, draftUrl(embedded))}`;
      const patched = await json(
        await call(box(`/drafts/${ctx.draftId}`), {
          method: 'PATCH',
          json: { bodyHtml, bodyText: 'draft body Rich paste' },
        }),
        200,
        'patch draft'
      );
      ctx.draftHtml = bodyHtml;
      const kinds = patched.message.attachments
        .map((entry) => entry.disposition)
        .sort();
      assert.deepEqual(kinds, ['attachment', 'inline', 'inline']);
      const back = await call(draftUrl(screenshot));
      expectStatus(back, 200, 'draft attachment read');
      assert.equal(
        sha256(Buffer.from(await back.arrayBuffer())),
        sha256(PNG_BYTES)
      );
      return {
        dispositions: kinds,
        objectPuts: s3.stats().put,
        fileId: Boolean(file.id),
      };
    }
  );

  await ev.step(
    'send under the inert provider fails closed, once, without retry',
    async () => {
      present(ctx.draftId, 'draft');
      assert.ok(
        s3.stats().put >= 3,
        'uploaded attachments never reached the object store'
      );
      const payload = {
        draftId: ctx.draftId,
        subject: `D394 compose ${cfg.runId}`,
        to: [cfg.recipient],
        bodyText: 'draft body Rich paste',
        bodyHtml: ctx.draftHtml,
      };
      const callsBefore = provider.calls;
      const sent = await call(box('/messages'), {
        method: 'POST',
        json: payload,
      });
      const body = await json(sent, 502, 'send');
      assert.equal(body.code, 'MAIL_SEND_UNCONFIRMED');
      assert.equal(provider.calls - callsBefore, 1, 'provider call count');
      assert.ok(
        provider.sawInertToken,
        'provider request lacked the inert token'
      );
      const state = await json(
        await call(box(`/messages/${ctx.draftId}`)),
        200,
        'state'
      );
      assert.equal(
        state.status,
        'sending',
        'durable sending claim not retained'
      );
      const replay = await call(box('/messages'), {
        method: 'POST',
        json: payload,
      });
      expectStatus(replay, 200, 'replay');
      assert.equal(
        provider.calls - callsBefore,
        1,
        'replay contacted the provider'
      );
      return {
        sendStatus: 502,
        code: body.code,
        providerCalls: provider.calls - callsBefore,
      };
    }
  );

  await ev.step('document and API security headers', async () => {
    const page = await call(`/en/${ws}/inbox`);
    expectStatus(page, 200, 'inbox page');
    assert.equal(page.headers.get('x-frame-options'), 'DENY');
    assert.equal(page.headers.get('cache-control'), 'private, no-store');
    assert.ok(page.headers.get('x-robots-tag'), 'x-robots-tag missing');
    assert.ok(
      page.headers.get('content-security-policy') ||
        page.headers.get('content-security-policy-report-only'),
      'no content security policy on the document'
    );
    const api = await call(`/api/v1/workspaces/${ws}/mail/bootstrap`);
    expectStatus(api, 200, 'bootstrap');
    assert.ok(
      api.headers.get('x-robots-tag'),
      'x-robots-tag missing on the API'
    );
    return {
      document: describe(page),
      api: describe(api),
      hsts: Boolean(page.headers.get('strict-transport-security')),
    };
  });
}
