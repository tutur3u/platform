// Spool of reply attachments on the orchestrator machine: where a v2 reply's
// files wait between the store and T3. A 0700 directory this user owns;
// each file is created exclusively (O_EXCL), never through a symlink
// (O_NOFOLLOW), mode 0600, under a generated name. Downloads go to the store
// origin the bridge socket uses and nowhere else, follow no redirect, stop
// at the signed size and must match the signed sha256 before they count.
// Files are removed only after T3 has taken the reply or it failed for good.
// Runbook: apps/docs/platform/features/mastermind-thread-replies.mdx#attachments
import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const { O_WRONLY, O_RDONLY, O_CREAT, O_EXCL, O_NOFOLLOW, O_NONBLOCK } =
  fs.constants;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** `<reply id>.<index>.<random>.part`: generated, never from the owner. */
const SPOOL_NAME =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(\d)\.([0-9a-f]{32})\.part$/;
const FETCH_PATH = '/v1/bridge/attachments/fetch';
const FETCH_TIMEOUT_MS = 30_000;
/** An orphan no journal mentions is removed after this long. */
export const SPOOL_ORPHAN_MS = 24 * 60 * 60 * 1000;

export class AttachmentError extends Error {
  /** `attachment_invalid` is permanent; `unavailable` may be retried. */
  constructor(code) {
    super(code);
    this.name = 'AttachmentError';
    this.code = code;
  }
}

const isOwn = (stat) =>
  typeof process.getuid !== 'function' || stat.uid === process.getuid();

/**
 * Opens (creating if needed) the spool directory. Refuses a symlink, a
 * non-directory or one another user owns, and narrows its mode to 0700.
 */
export function openSpool(dir) {
  fs.mkdirSync(path.dirname(dir), { recursive: true, mode: 0o700 });
  // The parent (the fleet-sync state directory) must be a real directory of
  // ours too, so the spool cannot be redirected through it.
  const parent = fs.lstatSync(path.dirname(dir));
  if (!parent.isDirectory() || parent.isSymbolicLink() || !isOwn(parent))
    throw new AttachmentError('spool_unsafe');
  try {
    fs.mkdirSync(dir, { mode: 0o700 });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }
  const stat = fs.lstatSync(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink() || !isOwn(stat))
    throw new AttachmentError('spool_unsafe');
  if ((stat.mode & 0o777) !== 0o700) fs.chmodSync(dir, 0o700);

  const fileOf = (name) => {
    if (!SPOOL_NAME.test(name)) throw new AttachmentError('spool_unsafe');
    return path.join(dir, name);
  };
  return {
    dir,
    /** A new, empty spool file for one object of one reply. */
    create(replyId, index) {
      if (!UUID.test(replyId) || !Number.isInteger(index) || index < 0)
        throw new AttachmentError('spool_unsafe');
      const name = `${replyId}.${index}.${randomBytes(16).toString('hex')}.part`;
      const fd = fs.openSync(
        fileOf(name),
        O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW,
        0o600
      );
      return { name, fd };
    },
    /** The bytes of a spool file, refusing anything but our own 0600 file. */
    read(name) {
      const fd = fs.openSync(fileOf(name), O_RDONLY | O_NOFOLLOW | O_NONBLOCK);
      try {
        const stat = fs.fstatSync(fd);
        if (!stat.isFile() || !isOwn(stat) || (stat.mode & 0o077) !== 0)
          throw new AttachmentError('spool_unsafe');
        return fs.readFileSync(fd);
      } finally {
        fs.closeSync(fd);
      }
    },
    remove(name) {
      fs.rmSync(fileOf(name), { force: true });
    },
    /** Spool files of one reply, or of every reply. */
    list(replyId) {
      let names;
      try {
        names = fs.readdirSync(dir);
      } catch {
        return [];
      }
      return names.filter((name) => {
        const match = SPOOL_NAME.exec(name);
        return match && (replyId === undefined || match[1] === replyId);
      });
    },
    /** Removes every file of a reply: after delivery or a terminal failure. */
    clear(replyId) {
      for (const name of this.list(replyId)) this.remove(name);
    },
    /**
     * Removes files of settled replies, and orphans older than a day that no
     * pending reply claims. Never touches what `pending(replyId)` still needs.
     */
    reconcile({ settled, pending, now = Date.now() }) {
      let removed = 0;
      for (const name of this.list()) {
        const replyId = SPOOL_NAME.exec(name)[1];
        let stale = false;
        try {
          stale = now - fs.lstatSync(fileOf(name)).mtimeMs > SPOOL_ORPHAN_MS;
        } catch {
          continue;
        }
        if (settled(replyId) || (!pending(replyId) && stale)) {
          this.remove(name);
          removed++;
        }
      }
      return removed;
    },
  };
}

/**
 * Writes every byte of `bytes`, however many calls the kernel needs. A call
 * that writes nothing or fails stops the download, which then keeps nothing.
 */
export function writeAll(fd, bytes, write = fs.writeSync) {
  for (let offset = 0; offset < bytes.byteLength;) {
    const written = write(fd, bytes, offset, bytes.byteLength - offset);
    if (!Number.isSafeInteger(written) || written <= 0)
      throw new AttachmentError('unavailable');
    offset += written;
  }
}

/** The https store origin of the bridge socket (ws loopback only in tests). */
export function storeOrigin(socketUrl) {
  const url = new URL(socketUrl);
  if (url.protocol === 'wss:') return `https://${url.host}`;
  if (url.protocol === 'ws:' && url.hostname === '127.0.0.1')
    return `http://${url.host}`;
  throw new AttachmentError('unavailable');
}

/**
 * Downloads one object into a new spool file. The request goes to the store
 * origin only, with the capability in a header (never in the URL), and no
 * redirect is followed; the body is cut off past the signed size, and the
 * file is kept only if size and sha256 match the signed manifest.
 */
export async function downloadObject({
  spool,
  origin,
  replyId,
  index,
  file,
  capability,
  fetchImpl = fetch,
}) {
  const url = new URL(FETCH_PATH, origin);
  url.searchParams.set('id', file.id);
  if (url.origin !== origin) throw new AttachmentError('unavailable');
  let response;
  try {
    response = await fetchImpl(url.toString(), {
      method: 'GET',
      headers: { authorization: `MM-Fetch ${capability}` },
      redirect: 'error',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch {
    throw new AttachmentError('unavailable');
  }
  // A redirect, or an answer from anywhere else, is never followed or used.
  if (
    response.redirected ||
    (response.url && new URL(response.url).origin !== origin) ||
    (response.status >= 300 && response.status < 400)
  )
    throw new AttachmentError('attachment_invalid');
  if (response.status === 404) throw new AttachmentError('attachment_invalid');
  if (!response.ok || !response.body) throw new AttachmentError('unavailable');
  const declared = response.headers.get('content-length');
  if (declared !== null && Number(declared) !== file.size)
    throw new AttachmentError('attachment_invalid');

  const { name, fd } = spool.create(replyId, index);
  const hash = createHash('sha256');
  let total = 0;
  let kept = false;
  try {
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > file.size) {
        await reader.cancel().catch(() => undefined);
        throw new AttachmentError('attachment_invalid');
      }
      hash.update(value);
      writeAll(fd, value);
    }
    fs.fsyncSync(fd);
    if (total !== file.size || hash.digest('hex') !== file.sha256)
      throw new AttachmentError('attachment_invalid');
    kept = true;
    return name;
  } catch (error) {
    throw error instanceof AttachmentError
      ? error
      : new AttachmentError('unavailable');
  } finally {
    fs.closeSync(fd);
    if (!kept) spool.remove(name);
  }
}

/** A spool file still holding exactly the signed bytes, or null. */
export function verifiedSpoolFile(spool, name, file) {
  try {
    const bytes = spool.read(name);
    return bytes.length === file.size &&
      createHash('sha256').update(bytes).digest('hex') === file.sha256
      ? bytes
      : null;
  } catch {
    return null;
  }
}
