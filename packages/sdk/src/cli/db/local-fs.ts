import { spawn } from 'node:child_process';
import { constants } from 'node:fs';
import {
  type FileHandle,
  lstat,
  open,
  opendir,
  realpath,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { CLI_EXIT, CliError, type CliExitCode } from '../cli-contracts';
import { assertNoUntrustedPathSymlinks } from '../upskii/http';

const MAX_MIGRATION_FILES = 5_000;
const DARWIN_PYTHON = '/usr/bin/python3';

const DARWIN_LIST_SCRIPT = [
  'import json, os, stat, sys',
  'dev, ino, cap = int(sys.argv[1]), int(sys.argv[2]), int(sys.argv[3])',
  'uid = os.getuid()',
  'dfd = os.open(".", os.O_RDONLY | os.O_DIRECTORY, dir_fd=3)',
  'try:',
  '  dst = os.fstat(dfd)',
  '  if not stat.S_ISDIR(dst.st_mode) or dst.st_dev != dev or dst.st_ino != ino or dst.st_uid != uid or (dst.st_mode & 0o022) != 0:',
  '    sys.exit(6)',
  '  out = []',
  '  for name in sorted(os.listdir(dfd)):',
  '    if not name.endswith(".sql"):',
  '      continue',
  '    fst = os.stat(name, dir_fd=dfd, follow_symlinks=False)',
  '    if stat.S_ISREG(fst.st_mode):',
  '      if fst.st_uid != uid or (fst.st_mode & 0o022) != 0:',
  '        sys.exit(6)',
  '      out.append(name)',
  '      if len(out) > cap:',
  '        sys.exit(8)',
  '  sys.stdout.write(json.dumps(out))',
  'finally:',
  '  os.close(dfd)',
].join('\n');

const DARWIN_READ_SCRIPT = [
  'import base64, errno, json, os, stat, sys',
  'dev, ino, name, cap = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3], int(sys.argv[4])',
  'uid = os.getuid()',
  'dst = os.fstat(3)',
  'if not stat.S_ISDIR(dst.st_mode) or dst.st_dev != dev or dst.st_ino != ino or dst.st_uid != uid or (dst.st_mode & 0o022) != 0:',
  '  sys.exit(6)',
  'try:',
  '  ffd = os.open(name, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=3)',
  'except OSError as e:',
  '  sys.exit(4 if e.errno == errno.ENOENT else 6)',
  'try:',
  '  fst = os.fstat(ffd)',
  '  if not stat.S_ISREG(fst.st_mode) or fst.st_uid != uid or (fst.st_mode & 0o022) != 0:',
  '    sys.exit(6)',
  '  if fst.st_size > cap:',
  '    sys.exit(7)',
  '  chunks = []',
  '  total = 0',
  '  while True:',
  '    buf = os.read(ffd, 65536)',
  '    if not buf:',
  '      break',
  '    total += len(buf)',
  '    if total > cap:',
  '      sys.exit(7)',
  '    chunks.append(buf)',
  '  raw = b"".join(chunks)',
  '  sys.stdout.write(json.dumps({"b64": base64.b64encode(raw).decode("ascii"), "mtimeMs": fst.st_mtime_ns // 1_000_000, "size": total}))',
  'finally:',
  '  os.close(ffd)',
].join('\n');

export interface RetainedDirectoryHandle {
  dev: bigint;
  fd: number;
  handle: FileHandle;
  ino: bigint;
  realDir: string;
}

const err = (
  code: string,
  message: string,
  exitCode: CliExitCode,
  cause?: unknown
) => new CliError({ cause, code, exitCode, message });

const policy = (code: string, msg: string) => err(code, msg, CLI_EXIT.policy);

function runDarwinFdHelper(
  fd: number,
  script: string,
  args: string[],
  maxStdoutBytes: number
): Promise<{ code: number; stdout: string }> {
  return new Promise((resolvePromise) => {
    const child = spawn(DARWIN_PYTHON, ['-I', '-c', script, ...args], {
      env: {},
      killSignal: 'SIGKILL',
      stdio: ['ignore', 'pipe', 'ignore', fd],
      timeout: 10_000,
    });
    const chunks: Buffer[] = [];
    let total = 0;
    let overflow = false;
    child.stdout?.on('data', (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxStdoutBytes) {
        overflow = true;
        child.kill('SIGKILL');
        return;
      }
      chunks.push(chunk);
    });
    child.on('error', () => resolvePromise({ code: 127, stdout: '' }));
    child.on('close', (code) => {
      if (overflow) {
        resolvePromise({ code: 7, stdout: '' });
        return;
      }
      resolvePromise({
        code: code ?? 127,
        stdout: Buffer.concat(chunks, total).toString('utf8'),
      });
    });
  });
}

async function assertTrustedLocalAncestors(realDir: string): Promise<void> {
  if (typeof process.getuid !== 'function') return;
  const uid = process.getuid();
  let cur = realDir;
  let reachedRoot = false;
  for (let depth = 0; depth < 64; depth += 1) {
    const info = await lstat(cur);
    if (info.isSymbolicLink() || !info.isDirectory())
      throw policy('UNSAFE_LOCAL_PATH', `Expected real directory: ${cur}`);
    const mode = info.mode & 0o7777;
    const isTarget = depth === 0;
    if (isTarget) {
      if (info.uid !== uid)
        throw policy(
          'UNSAFE_LOCAL_PATH',
          `Directory must be owned by current user: ${cur}`
        );
      if ((mode & 0o022) !== 0)
        throw policy(
          'UNSAFE_LOCAL_PATH',
          `Directory must not be group/world-writable: ${cur}`
        );
    } else {
      if (info.uid !== uid && info.uid !== 0)
        throw policy('UNSAFE_LOCAL_PATH', `Untrusted directory owner: ${cur}`);
      if ((mode & 0o022) !== 0 && (mode & 0o1000) === 0)
        throw policy('UNSAFE_LOCAL_PATH', `Writable non-sticky parent: ${cur}`);
    }
    const parent = dirname(cur);
    if (parent === cur) {
      reachedRoot = true;
      break;
    }
    cur = parent;
  }
  if (!reachedRoot)
    throw policy(
      'UNSAFE_LOCAL_PATH',
      `Directory depth limit exceeded: ${realDir}`
    );
}

async function assertRetainedFd(
  anchor: RetainedDirectoryHandle
): Promise<void> {
  const fdInfo = await anchor.handle.stat({ bigint: true });
  const uid =
    typeof process.getuid === 'function' ? BigInt(process.getuid()) : null;
  if (
    !fdInfo.isDirectory() ||
    fdInfo.nlink === 0n ||
    fdInfo.dev !== anchor.dev ||
    fdInfo.ino !== anchor.ino ||
    (uid !== null && (fdInfo.uid !== uid || (fdInfo.mode & 0o022n) !== 0n))
  ) {
    throw policy(
      'UNSAFE_LOCAL_PATH',
      `Retained directory descriptor changed: ${anchor.realDir}`
    );
  }
}

export async function withAnchoredDirectory<T>(
  dirPath: string,
  notFoundCode: string,
  fn: (anchor: RetainedDirectoryHandle) => Promise<T>
): Promise<T> {
  await assertNoUntrustedPathSymlinks(dirPath);
  const realDir = await realpath(resolve(dirPath)).catch((e) => {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT')
      throw err(
        notFoundCode,
        `Directory not found: ${dirPath}`,
        CLI_EXIT.notFound,
        e
      );
    throw policy('UNSAFE_LOCAL_PATH', `Unreadable directory: ${dirPath}`);
  });
  await assertTrustedLocalAncestors(realDir);
  const openFlags =
    constants.O_RDONLY |
    (constants.O_DIRECTORY ?? 0) |
    (constants.O_NOFOLLOW ?? 0);
  const handle = await open(realDir, openFlags).catch((e) => {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT')
      throw err(
        notFoundCode,
        `Directory not found: ${dirPath}`,
        CLI_EXIT.notFound,
        e
      );
    throw policy('UNSAFE_LOCAL_PATH', `Refusing unsafe directory: ${dirPath}`);
  });
  try {
    const info = await handle.stat({ bigint: true });
    if (!info.isDirectory() || info.nlink === 0n)
      throw policy(
        'UNSAFE_LOCAL_PATH',
        `Expected a real directory: ${realDir}`
      );
    if (typeof process.getuid === 'function') {
      const uid = BigInt(process.getuid());
      if (info.uid !== uid || (info.mode & 0o022n) !== 0n) {
        throw policy(
          'UNSAFE_LOCAL_PATH',
          `Directory must be owned by current user and non-group/world-writable: ${realDir}`
        );
      }
    }
    return await fn({
      dev: info.dev,
      fd: handle.fd,
      handle,
      ino: info.ino,
      realDir,
    });
  } finally {
    await handle.close();
  }
}

export async function listAnchoredSqlFiles(
  anchor: RetainedDirectoryHandle
): Promise<string[]> {
  await assertRetainedFd(anchor);
  if (process.platform === 'linux') {
    const base = `/proc/self/fd/${anchor.fd}`;
    const sqlFiles: string[] = [];
    const uid = typeof process.getuid === 'function' ? process.getuid() : null;
    const dir = await opendir(base);
    try {
      for await (const entry of dir) {
        if (
          entry.isFile() &&
          !entry.isSymbolicLink() &&
          entry.name.endsWith('.sql')
        ) {
          const st = await lstat(join(base, entry.name)).catch(() => null);
          if (
            !st ||
            st.isSymbolicLink() ||
            !st.isFile() ||
            (uid !== null && (st.uid !== uid || (st.mode & 0o022) !== 0))
          ) {
            throw policy(
              'UNSAFE_LOCAL_PATH',
              `Refusing migration file with untrusted owner or mode: ${entry.name}`
            );
          }
          sqlFiles.push(entry.name);
          if (sqlFiles.length > MAX_MIGRATION_FILES) {
            throw policy(
              'DB_TOO_MANY_FILES',
              `Migrations directory exceeds ${MAX_MIGRATION_FILES} file limit.`
            );
          }
        }
      }
    } finally {
      await dir.close().catch(() => undefined);
    }
    await assertRetainedFd(anchor);
    return sqlFiles.sort((a, b) => a.localeCompare(b));
  }

  if (process.platform === 'darwin') {
    const res = await runDarwinFdHelper(
      anchor.fd,
      DARWIN_LIST_SCRIPT,
      [String(anchor.dev), String(anchor.ino), String(MAX_MIGRATION_FILES)],
      4 * 1024 * 1024
    );
    if (res.code === 8) {
      throw policy(
        'DB_TOO_MANY_FILES',
        `Migrations directory exceeds ${MAX_MIGRATION_FILES} file limit.`
      );
    }
    if (res.code !== 0) {
      throw policy(
        res.code === 127 ? 'FD_ANCHOR_UNAVAILABLE' : 'UNSAFE_LOCAL_PATH',
        `Unable to enumerate directory via retained descriptor: ${anchor.realDir}`
      );
    }
    await assertRetainedFd(anchor);
    return JSON.parse(res.stdout) as string[];
  }

  throw policy(
    'FD_ANCHOR_UNAVAILABLE',
    'Descriptor-anchored directory enumeration is unavailable on this platform.'
  );
}

export async function readAnchoredRegularFile(
  anchor: RetainedDirectoryHandle,
  fileName: string,
  maxBytes: number,
  notFoundCode: string
): Promise<{ content: string; mtime: Date; size: number }> {
  if (
    !fileName ||
    fileName === '.' ||
    fileName === '..' ||
    fileName.includes('/') ||
    fileName.includes('\\') ||
    fileName.includes('\0')
  )
    throw policy('UNSAFE_LOCAL_PATH', `Invalid file name: ${fileName}`);
  await assertRetainedFd(anchor);

  if (process.platform === 'linux') {
    const target = join(`/proc/self/fd/${anchor.fd}`, fileName);
    const openFlags =
      constants.O_RDONLY |
      (constants.O_NOFOLLOW ?? 0) |
      (constants.O_NONBLOCK ?? 0);
    const handle = await open(target, openFlags).catch((e) => {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT')
        throw err(
          notFoundCode,
          `File not found: ${fileName}`,
          CLI_EXIT.notFound,
          e
        );
      throw policy(
        'UNSAFE_LOCAL_PATH',
        `Refusing symlink or unreadable file: ${fileName}`
      );
    });
    try {
      await assertRetainedFd(anchor);
      const info = await handle.stat();
      if (!info.isFile())
        throw policy(
          'UNSAFE_LOCAL_PATH',
          `Expected a regular file: ${fileName}`
        );
      if (
        typeof process.getuid === 'function' &&
        (info.uid !== process.getuid() || (info.mode & 0o022) !== 0)
      ) {
        throw policy(
          'UNSAFE_LOCAL_PATH',
          `File must be owned by current user and non-group/world-writable: ${fileName}`
        );
      }
      if (info.size > maxBytes)
        throw policy(
          'DB_FILE_TOO_LARGE',
          `File exceeds ${maxBytes} byte limit: ${fileName}`
        );
      const chunks: Buffer[] = [];
      let total = 0;
      const buf = Buffer.alloc(65_536);
      while (true) {
        const { bytesRead } = await handle.read(buf, 0, buf.length, null);
        if (bytesRead === 0) break;
        total += bytesRead;
        if (total > maxBytes)
          throw policy(
            'DB_FILE_TOO_LARGE',
            `File exceeded ${maxBytes} byte limit: ${fileName}`
          );
        chunks.push(Buffer.from(buf.subarray(0, bytesRead)));
      }
      return {
        content: Buffer.concat(chunks, total).toString('utf8'),
        mtime: info.mtime,
        size: total,
      };
    } finally {
      await handle.close();
    }
  }

  if (process.platform === 'darwin') {
    const maxEncodedBytes = Math.ceil((maxBytes * 4) / 3) + 16_384;
    const res = await runDarwinFdHelper(
      anchor.fd,
      DARWIN_READ_SCRIPT,
      [String(anchor.dev), String(anchor.ino), fileName, String(maxBytes)],
      maxEncodedBytes
    );
    if (res.code === 4) {
      throw err(notFoundCode, `File not found: ${fileName}`, CLI_EXIT.notFound);
    }
    if (res.code === 7) {
      throw policy(
        'DB_FILE_TOO_LARGE',
        `File exceeds ${maxBytes} byte limit: ${fileName}`
      );
    }
    if (res.code !== 0) {
      throw policy(
        res.code === 127 ? 'FD_ANCHOR_UNAVAILABLE' : 'UNSAFE_LOCAL_PATH',
        `Refusing symlink or unreadable file: ${fileName}`
      );
    }
    await assertRetainedFd(anchor);
    const parsed = JSON.parse(res.stdout) as {
      b64: string;
      mtimeMs: number;
      size: number;
    };
    return {
      content: Buffer.from(parsed.b64, 'base64').toString('utf8'),
      mtime: new Date(parsed.mtimeMs),
      size: parsed.size,
    };
  }

  throw policy(
    'FD_ANCHOR_UNAVAILABLE',
    'Descriptor-anchored file reads are unavailable on this platform.'
  );
}
