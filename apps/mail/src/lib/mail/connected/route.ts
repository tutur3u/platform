import type { NextRequest } from 'next/server';
import { connection, NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveMailRouteContext } from '../auth';
import { attachmentBytes } from './attachment-bytes';
import { parseConnectedBody } from './body';
import { ConnectedMailError } from './config';
import { listMessages, readMessage, updateMessage } from './messages';
import { composeSchema } from './mime';
import { startOAuth } from './oauth';
import { getAccount, listAccounts, table } from './repository';
import {
  respondToConnectedInvitation,
  saveDraft,
  sendConnectedMessage,
  sendProviderDraft,
} from './send';

export async function connectedMailRoute(
  request: NextRequest,
  wsId: string,
  segments: string[]
) {
  await connection();
  try {
    if (request.method !== 'GET') {
      const origin = request.headers.get('origin');
      if (origin !== request.nextUrl.origin)
        return NextResponse.json(
          { error: 'Invalid request origin' },
          { status: 403 }
        );
    }
    const resolved = await resolveMailRouteContext(request, wsId, true);
    if (!resolved.ok) return resolved.response;
    const ctx = resolved.context;
    if (!segments.length && request.method === 'GET')
      return NextResponse.json(await listAccounts(ctx));
    if (
      segments[0] === 'connect' &&
      segments.length === 1 &&
      request.method === 'POST'
    ) {
      const body = await parseConnectedBody(
        request,
        z.object({ provider: z.enum(['google', 'microsoft']) })
      );
      if (!body.ok) return body.response;
      return await startOAuth(ctx, body.data.provider);
    }
    const accountId = z.uuid().safeParse(segments[0]);
    if (!accountId.success)
      return NextResponse.json({ error: 'Invalid account' }, { status: 400 });
    const account = await getAccount(ctx, accountId.data);
    if (segments.length === 1 && request.method === 'DELETE') {
      const { error } = await (await table('mail_connected_accounts'))
        .delete()
        .eq('id', account.id)
        .eq('user_id', ctx.user.id)
        .eq('ws_id', ctx.normalizedWsId);
      if (error) throw new Error('Failed to disconnect mail account');
      return NextResponse.json({ disconnected: true });
    }
    if (
      segments[1] === 'messages' &&
      segments.length === 2 &&
      request.method === 'GET'
    ) {
      const params = z
        .object({
          folder: z
            .enum(['inbox', 'sent', 'drafts', 'archive', 'trash', 'spam'])
            .default('inbox'),
          cursor: z.string().max(4096).optional(),
          q: z.string().max(500).default(''),
        })
        .safeParse(Object.fromEntries(request.nextUrl.searchParams));
      if (!params.success)
        return NextResponse.json(
          { error: 'Invalid message query' },
          { status: 400 }
        );
      return NextResponse.json(
        await listMessages(
          account,
          params.data.folder,
          params.data.cursor,
          params.data.q
        )
      );
    }
    if (segments[1] === 'messages' && segments[2]) {
      const messageId = segments[2];
      if (messageId.length > 2048)
        return NextResponse.json(
          { error: 'Invalid message id' },
          { status: 400 }
        );
      if (segments.length === 3 && request.method === 'GET')
        return NextResponse.json(
          (
            await readMessage(
              account,
              messageId,
              request.nextUrl.searchParams.get('draft') === '1'
            )
          ).detail
        );
      if (segments.length === 3 && request.method === 'POST') {
        const body = await parseConnectedBody(
          request,
          z.object({
            action: z.enum([
              'mark_read',
              'mark_unread',
              'archive',
              'trash',
              'restore',
              'star',
              'unstar',
            ]),
          })
        );
        if (!body.ok) return body.response;
        await updateMessage(account, messageId, body.data.action);
        return NextResponse.json({ updated: true });
      }
      if (
        segments[3] === 'invitation' &&
        segments.length === 4 &&
        request.method === 'POST'
      ) {
        const body = await parseConnectedBody(
          request,
          z.object({
            response: z.enum(['ACCEPTED', 'DECLINED', 'TENTATIVE']),
            requestId: z.uuid(),
          })
        );
        if (!body.ok) return body.response;
        return NextResponse.json(
          await respondToConnectedInvitation(
            account,
            messageId,
            body.data.response,
            body.data.requestId
          )
        );
      }
      if (
        segments[3] === 'attachments' &&
        segments.length === 5 &&
        request.method === 'GET'
      ) {
        const index = z
          .string()
          .regex(/^\d{1,3}$/u)
          .safeParse(segments[4]);
        if (!index.success)
          return NextResponse.json(
            { error: 'Invalid attachment' },
            { status: 400 }
          );
        const file = (
          await readMessage(
            account,
            messageId,
            request.nextUrl.searchParams.get('draft') === '1'
          )
        ).files[Number(index.data)];
        if (!file)
          return NextResponse.json(
            { error: 'Attachment not found' },
            { status: 404 }
          );
        return new NextResponse(new Uint8Array(attachmentBytes(file.content)), {
          headers: {
            'Content-Type': 'application/octet-stream',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(file.filename || 'attachment')}`,
          },
        });
      }
    }
    if (
      segments[1] === 'drafts' &&
      segments[2] &&
      segments.length === 3 &&
      request.method === 'POST'
    ) {
      const body = await parseConnectedBody(
        request,
        z.object({ requestId: z.uuid() })
      );
      if (!body.ok) return body.response;
      if (segments[2].length > 2048)
        throw new ConnectedMailError(400, 'Invalid draft id');
      return NextResponse.json(
        await sendProviderDraft(account, segments[2], body.data.requestId)
      );
    }
    if (
      segments.length === 2 &&
      ['send', 'drafts'].includes(segments[1]!) &&
      request.method === 'POST'
    ) {
      const body = await parseConnectedBody(request, composeSchema);
      if (!body.ok) return body.response;
      return NextResponse.json(
        segments[1] === 'send'
          ? await sendConnectedMessage(account, body.data)
          : await saveDraft(account, body.data)
      );
    }
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  } catch (error) {
    if (error instanceof ConnectedMailError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status }
      );
    console.error('[mail] connected account operation failed', {
      type: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { error: 'Connected mail is unavailable' },
      { status: 500 }
    );
  }
}
