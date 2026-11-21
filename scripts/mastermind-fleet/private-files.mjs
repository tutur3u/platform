// Private state files of the Mastermind fleet tooling (cached MCP token, send
// journal, reply ledger, pokes). Every open refuses symlinks and never blocks
// on a FIFO planted at the path; reads accept only a regular file owned by
// this user; writes create their temp file exclusively with mode 0600.
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const {
  O_RDONLY,
  O_WRONLY,
  O_APPEND,
  O_CREAT,
  O_EXCL,
  O_NOFOLLOW,
  O_NONBLOCK,
} = fs.constants;

function ownRegularFile(fd, { privateMode }) {
  const stat = fs.fstatSync(fd);
  return (
    stat.isFile() &&
    (typeof process.getuid !== 'function' || stat.uid === process.getuid()) &&
    (!privateMode || (stat.mode & 0o077) === 0)
  );
}

/**
 * The file's text, or null when it is missing or is not a regular file this
 * user owns. `privateMode` (default) also refuses group or world access.
 */
export function readPrivateFile(file, { privateMode = true } = {}) {
  let fd;
  try {
    fd = fs.openSync(file, O_RDONLY | O_NOFOLLOW | O_NONBLOCK);
    if (!ownRegularFile(fd, { privateMode })) return null;
    return fs.readFileSync(fd, 'utf8');
  } catch {
    return null;
  } finally {
    if (fd !== undefined) fs.closeSync(fd);
  }
}

/** Replaces `file` atomically through an exclusively created 0600 temp file. */
export function writePrivateFile(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temp = `${file}.${process.pid}.${randomBytes(6).toString('hex')}.tmp`;
  const fd = fs.openSync(temp, O_WRONLY | O_CREAT | O_EXCL | O_NOFOLLOW, 0o600);
  try {
    fs.writeFileSync(fd, text);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temp, file);
}

/** Appends one line; throws `private_file_unsafe` rather than write elsewhere. */
export function appendPrivateLine(file, line) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const fd = fs.openSync(
    file,
    O_WRONLY | O_APPEND | O_CREAT | O_NOFOLLOW | O_NONBLOCK,
    0o600
  );
  try {
    if (!ownRegularFile(fd, { privateMode: true }))
      throw new Error('private_file_unsafe');
    fs.writeFileSync(fd, `${line}\n`);
  } finally {
    fs.closeSync(fd);
  }
}
