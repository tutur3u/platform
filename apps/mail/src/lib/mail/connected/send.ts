import { createHash } from 'node:crypto';
import { type CalendarResponse, calendarReply } from '../calendar-invitation';
import { attachmentBytes } from './attachment-bytes';
import { ConnectedMailError } from './config';
import { readMessage } from './messages';
import { buildMime, type ComposePayload, type MimeAttachment } from './mime';
import { type ConnectedAccount, table } from './repository';
import { jsonBody, providerJson, providerRequest } from './transport';

async function composeMime(account: ConnectedAccount, input: ComposePayload) {
  const payload = { ...input };
  let threadId: string | undefined;
  const attachments: MimeAttachment[] = payload.attachments.map((file) => ({
    filename: file.filename,
    contentType: file.contentType,
    content: Buffer.from(file.base64, 'base64'),
  }));
  if (payload.sourceId || payload.draftId) {
    const source = await readMessage(
      account,
      payload.draftId ?? payload.sourceId!,
      !!payload.draftId
    );
    const subjectIdentity = (value: string) =>
      value.trim().replace(/^(?:re:\s*)+/iu, '');
    if (
      account.provider === 'google' &&
      (payload.draftId ||
        payload.mode === 'reply' ||
        payload.mode === 'reply_all') &&
      subjectIdentity(payload.subject) ===
        subjectIdentity(source.detail.subject ?? '')
    )
      threadId = source.providerThreadId;
    if (payload.draftId) {
      payload.inReplyTo = source.originalInReplyTo;
      payload.references = source.detail.references ?? [];
      if (payload.html !== undefined && payload.text === source.detail.text)
        payload.html = source.originalHtml;
    }
    if (payload.mode === 'reply' || payload.mode === 'reply_all') {
      payload.inReplyTo = source.detail.internetMessageId;
      payload.references = [
        ...new Set([
          ...(source.detail.references ?? []),
          ...(payload.inReplyTo ? [payload.inReplyTo] : []),
        ]),
      ].slice(-100);
    }
    for (const id of payload.attachmentIds) {
      const file = source.files[Number(id)];
      if (!file)
        throw new ConnectedMailError(400, 'Attachment no longer available');
      attachments.push({
        filename: file.filename || 'attachment',
        contentType: file.mimeType,
        content: attachmentBytes(file.content),
        contentId: file.contentId,
      });
    }
  } else if (payload.attachmentIds.length)
    throw new ConnectedMailError(400, 'Attachment source required');
  return { raw: buildMime(account.address, payload, attachments), threadId };
}

export async function saveDraft(
  account: ConnectedAccount,
  payload: ComposePayload
) {
  let original: { isDraft?: boolean; '@odata.etag'?: string } | undefined;
  if (payload.draftId && account.provider === 'microsoft') {
    original = await providerJson(
      account,
      `/messages/${encodeURIComponent(payload.draftId)}?$select=isDraft`
    );
    if (!original?.isDraft || !original['@odata.etag'])
      throw new ConnectedMailError(409, 'Draft changed; reload before editing');
  }
  const { raw, threadId } = await composeMime(account, payload);
  if (account.provider === 'google')
    return providerJson(
      account,
      payload.draftId
        ? `/drafts/${encodeURIComponent(payload.draftId)}`
        : '/drafts',
      jsonBody(
        { message: { raw: raw.toString('base64url'), threadId } },
        payload.draftId ? 'PUT' : 'POST'
      )
    );
  const replacement = await providerJson(account, '/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: raw.toString('base64'),
  });
  if (!replacement?.id)
    throw new ConnectedMailError(
      502,
      'Provider did not confirm the saved draft'
    );
  if (payload.draftId && original) {
    // Graph has no MIME draft update. Confirm the replacement before deleting
    // the unchanged original, with an ETag fence against concurrent editing.
    try {
      await providerRequest(
        account,
        `/messages/${encodeURIComponent(payload.draftId)}`,
        { method: 'DELETE', headers: { 'If-Match': original['@odata.etag']! } }
      );
    } catch {
      throw new ConnectedMailError(
        409,
        'Replacement draft saved; original retained because it changed or could not be removed'
      );
    }
  }
  return replacement;
}

export async function sendConnectedMessage(
  account: ConnectedAccount,
  payload: ComposePayload,
  semanticHash?: string
) {
  if (payload.draftId)
    throw new ConnectedMailError(
      400,
      'Save draft changes before sending from Drafts'
    );
  const { raw, threadId } = await composeMime(account, payload);
  const payloadHash = createHash('sha256')
    .update(semanticHash ?? JSON.stringify(payload))
    .digest('hex');
  return claimedSend(account, payload.requestId, payloadHash, async () => {
    if (account.provider === 'google')
      await providerJson(
        account,
        '/messages/send',
        jsonBody({ raw: raw.toString('base64url'), threadId })
      );
    else
      await providerRequest(account, '/sendMail', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: raw.toString('base64'),
      });
  });
}

async function claimedSend(
  account: ConnectedAccount,
  requestId: string,
  payloadHash: string,
  submit: () => Promise<void>
) {
  const sends = await table('mail_connected_sends');
  const { error: claimError } = await sends.insert({
    account_id: account.id,
    request_id: requestId,
    payload_hash: payloadHash,
    status: 'sending',
  });
  if (claimError) {
    if (claimError.code !== '23505')
      throw new Error('Failed to reserve mail send');
    const { data, error } = await sends
      .select('status,payload_hash')
      .eq('account_id', account.id)
      .eq('request_id', requestId)
      .single();
    if (error || data.payload_hash !== payloadHash)
      throw new ConnectedMailError(
        409,
        'Send request changed; create a new message'
      );
    if (data.status !== 'sent')
      throw new ConnectedMailError(
        409,
        'Send result is uncertain; check provider Sent before sending again'
      );
    return { status: 'sent' };
  }
  try {
    await submit();
    const { error } = await (await table('mail_connected_sends'))
      .update({ status: 'sent' })
      .eq('account_id', account.id)
      .eq('request_id', requestId);
    if (error) throw new Error('Failed to record provider send receipt');
    return { status: 'sent' };
  } catch (error) {
    await (await table('mail_connected_sends'))
      .update({ status: 'uncertain' })
      .eq('account_id', account.id)
      .eq('request_id', requestId);
    throw error;
  }
}
export async function respondToConnectedInvitation(
  account: ConnectedAccount,
  id: string,
  response: CalendarResponse,
  requestId: string
) {
  const { detail } = await readMessage(account, id);
  if (!detail.invitation)
    throw new ConnectedMailError(409, 'Invitation is no longer available');
  const invitation = detail.invitation;
  return sendConnectedMessage(
    account,
    {
      requestId,
      to: [invitation.organizer],
      cc: [],
      bcc: [],
      subject: `Re: ${detail.subject}`,
      text: `${response}: ${invitation.summary}`,
      references: detail.references ?? [],
      inReplyTo: detail.internetMessageId,
      sourceId: id,
      mode: 'reply',
      attachmentIds: [],
      attachments: [
        {
          filename: 'reply.ics',
          contentType: 'text/calendar; charset=UTF-8; method=REPLY',
          base64: Buffer.from(
            calendarReply(invitation, response, new Date())
          ).toString('base64'),
        },
      ],
    },
    JSON.stringify({ id, response, requestId })
  );
}

export async function sendProviderDraft(
  account: ConnectedAccount,
  draftId: string,
  requestId: string
) {
  const payloadHash = createHash('sha256')
    .update(`draft:${draftId}`)
    .digest('hex');
  return claimedSend(account, requestId, payloadHash, async () => {
    if (account.provider === 'google')
      await providerJson(account, '/drafts/send', jsonBody({ id: draftId }));
    else {
      const draft = await providerJson(
        account,
        `/messages/${encodeURIComponent(draftId)}?$select=isDraft`
      );
      if (!draft?.isDraft)
        throw new ConnectedMailError(409, 'This message is no longer a draft');
      await providerRequest(
        account,
        `/messages/${encodeURIComponent(draftId)}/send`,
        { method: 'POST' }
      );
    }
  });
}
