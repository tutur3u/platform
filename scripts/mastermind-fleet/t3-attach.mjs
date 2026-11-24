// Delivery of a reply with attachments into a T3 thread on this machine.
// The whole bundle is staged first: each file downloaded from the store (or
// an intact spool copy reused), re-checked against its signed digest and
// uploaded to the local T3 server over loopback. Only then is one
// `t3_thread_send_attachments` submission made, recorded in the send journal
// before it goes out. T3 takes no retry key for it, so a submission that was
// begun and never reported back (a crash, a timeout) is looked for in the
// thread by the reply marker on its first line; found, it is delivered, and
// not found, it fails for good: it is never submitted a second time.
// Runbook: apps/docs/platform/features/mastermind-thread-replies.mdx#attachments
import {
  AttachmentError,
  downloadObject,
  verifiedSpoolFile,
} from './attachment-spool.mjs';
import {
  attachmentMessage,
  fetchCapability,
  replyMarker,
  safeName,
} from './bridge-attach.mjs';
import { T3McpError } from './t3-mcp.mjs';
import { IN_FLIGHT_GRACE_MS } from './t3-steer.mjs';

const LOOPBACK_ORIGIN = /^http:\/\/127\.0\.0\.1:\d{2,5}$/;
const T3_ATTACHMENT_ID = /^[a-z0-9_-]{1,128}$/i;
const T3_UPLOAD_PATH = /^\/api\/attachments\/upload\/[\w.-]{1,4000}$/;
const UPLOAD_TIMEOUT_MS = 30_000;
const PROBE_PAGES = 5;

const journalKey = (id) => `mm-attach:${id}`;

/** Whether a submission with this reply's marker is already in the thread. */
async function findMarked(call, threadId, id) {
  const marker = replyMarker(id);
  let beforePosition;
  for (let page = 0; page < PROBE_PAGES; page++) {
    const read = await call('t3_thread_read', {
      threadId,
      limit: 100,
      ...(beforePosition === undefined ? {} : { beforePosition }),
    });
    const hit = (read?.items ?? []).find(
      (item) => typeof item?.text === 'string' && item.text.startsWith(marker)
    );
    if (hit) return hit;
    if (!Number.isInteger(read?.earlierPosition)) return undefined;
    beforePosition = read.earlierPosition;
  }
  return undefined;
}

/** Uploads one verified file to the local T3 server; returns its pending id. */
async function uploadToT3({ call, t3Origin, file, bytes, fetchImpl }) {
  const upload = {
    type: file.kind === 'image' ? 'image' : 'file',
    name: safeName(file.name),
    mimeType: file.mime,
    sizeBytes: bytes.length,
  };
  const issued = await call('t3_attachment_prepare_upload', { upload });
  const attachmentId = issued?.attachmentId;
  const relativeUrl = issued?.relativeUrl;
  // Only the loopback server's own upload path: a full `uploadUrl` from the
  // answer is never used, so no other host can receive the bytes.
  if (
    typeof attachmentId !== 'string' ||
    !T3_ATTACHMENT_ID.test(attachmentId) ||
    typeof relativeUrl !== 'string' ||
    !T3_UPLOAD_PATH.test(relativeUrl)
  )
    throw new T3McpError('t3_rpc_error');
  let response;
  try {
    response = await fetchImpl(`${t3Origin}${relativeUrl}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'content-length': String(bytes.length),
      },
      body: bytes,
      redirect: 'error',
      signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS),
    });
  } catch {
    throw new T3McpError('t3_unreachable');
  }
  if (response.status !== 204) throw new T3McpError('t3_rpc_error');
  return { ...upload, id: attachmentId };
}

/**
 * Delivers one verified v2 reply. `call` is an open MCP session's call,
 * `journal` the send journal (t3-steer.mjs) and `bearerId` the session's
 * bearer fingerprint; `t3Origin` is the local server's loopback origin and
 * `storeOrigin` the bridge's. Throws `AttachmentError('attachment_invalid')`
 * for files that do not match their manifest, `AttachmentError
 * ('attachment_ambiguous')` for a submission that may or may not have
 * landed, `T3McpError` from T3 itself, and anything else for a retry.
 */
export async function deliverBundle(
  { envelope, text, files },
  {
    call,
    journal,
    bearerId,
    spool,
    secret,
    machineId,
    storeOrigin,
    t3Origin,
    fetchImpl = fetch,
    now = Date.now,
  }
) {
  const { id, threadId } = envelope;
  if (!LOOPBACK_ORIGIN.test(String(t3Origin ?? '')))
    throw new T3McpError('t3_not_running');
  const key = journalKey(id);
  const finish = (receipt) => {
    try {
      journal.settle(key, receipt);
    } catch {
      // Delivered either way; the ledger records it.
    }
    return receipt;
  };

  // A submission begun earlier is reconciled before anything else happens.
  const known = journal.get(key);
  if (known?.r) return known.r;
  if (known) {
    // A submission still in T3's hands may not be in the timeline yet.
    if (now() - known.at < IN_FLIGHT_GRACE_MS)
      throw new T3McpError('steer_in_flight');
    const landed = await findMarked(call, threadId, id);
    if (landed)
      return finish({
        delivery: 'delivered',
        threadId,
        messageId: landed.messageId ?? null,
        runId: landed.runId ?? null,
      });
    throw new AttachmentError('attachment_ambiguous');
  }

  // Stage: every file present and verified before T3 sees any of them.
  const staged = [];
  for (const [index, file] of files.entries()) {
    let bytes = null;
    for (const name of spool.list(id)) {
      if (!name.startsWith(`${id}.${index}.`)) continue;
      bytes = verifiedSpoolFile(spool, name, file);
      if (bytes) break;
      spool.remove(name);
    }
    if (!bytes) {
      const name = await downloadObject({
        spool,
        origin: storeOrigin,
        replyId: id,
        index,
        file,
        capability: fetchCapability(secret, {
          replyId: id,
          machineId,
          objectId: file.id,
          sha256: file.sha256,
        }),
        fetchImpl,
      });
      bytes = verifiedSpoolFile(spool, name, file);
      if (!bytes) throw new AttachmentError('attachment_invalid');
    }
    staged.push({ file, bytes });
  }
  const attachments = [];
  for (const { file, bytes } of staged)
    attachments.push(
      await uploadToT3({ call, t3Origin, file, bytes, fetchImpl })
    );

  let claim;
  try {
    claim = journal.claim(key, bearerId, now());
  } catch {
    throw new T3McpError('steer_journal_unsafe');
  }
  if (claim.receipt) return claim.receipt;
  // Someone else began it meanwhile: the next attempt reconciles.
  if (!claim.begun) throw new T3McpError('steer_in_flight');

  const sent = await call('t3_thread_send_attachments', {
    threadId,
    message: attachmentMessage(id, text, files),
    attachments,
  });
  if (typeof sent?.messageId !== 'string') throw new T3McpError('t3_rpc_error');
  // A run status says whether it queued; anything else landed, how unknown.
  let delivery = sent.status === 'queued' ? 'queued' : undefined;
  if (sent.status === 'queued') {
    // Like a text reply: promote the queued message into the running turn.
    try {
      const read = await call('t3_thread_read', { threadId, limit: 1 });
      const activeRunId = read?.thread?.activeRunId ?? read?.activeRunId;
      if (typeof activeRunId === 'string' && activeRunId !== sent.runId) {
        await call('t3_queue', {
          threadId,
          action: 'promote_to_steer',
          queuedRunId: sent.runId,
          targetRunId: activeRunId,
        });
        delivery = 'steered';
      }
    } catch {
      // Promotion is best effort; the message is safe in the queue.
    }
  }
  return finish({
    ...(delivery ? { delivery } : {}),
    threadId: sent.threadId ?? threadId,
    messageId: sent.messageId,
    runId: sent.runId ?? null,
  });
}
