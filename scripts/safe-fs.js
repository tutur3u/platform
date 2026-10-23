const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

function privateTempDirSync(
  prefix = 'tuturuuu-',
  parent = os.tmpdir(),
  fsImpl = fs
) {
  const directory = fsImpl.mkdtempSync(path.join(parent, prefix));
  fsImpl.chmodSync(directory, 0o700);
  return directory;
}

function fileError(message, code) {
  return Object.assign(new Error(message), { code });
}

function readFileSnapshotSync(file, options = {}) {
  const { fsImpl = fs, encoding = null, maxBytes = Infinity } = options;
  const fd = fsImpl.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
  );
  try {
    const stat = fsImpl.fstatSync(fd);
    if (!stat.isFile())
      throw fileError('Expected a regular file', 'ERR_FS_NOT_REGULAR');
    if (stat.size > maxBytes)
      throw fileError('Input size cap exceeded', 'ERR_FS_FILE_TOO_LARGE');
    // A bounded read also enforces the cap if the opened file grows.
    let data;
    if (Number.isFinite(maxBytes)) {
      const chunks = [];
      let length = 0;
      while (length <= maxBytes) {
        const buffer = Buffer.alloc(Math.min(65536, maxBytes + 1 - length));
        const count = fsImpl.readSync(fd, buffer, 0, buffer.length, null);
        if (count === 0) break;
        length += count;
        if (length > maxBytes)
          throw fileError('Input size cap exceeded', 'ERR_FS_FILE_TOO_LARGE');
        chunks.push(buffer.subarray(0, count));
      }
      data = Buffer.concat(chunks, length);
    } else {
      data = fsImpl.readFileSync(fd);
    }
    return { data: encoding ? data.toString(encoding) : data, stat };
  } finally {
    fsImpl.closeSync(fd);
  }
}

function readRegularFileSync(file, options) {
  return readFileSnapshotSync(file, options).data;
}

async function readFileSnapshot(file, options = {}) {
  const { encoding = null, maxBytes = Infinity } = options;
  const handle = await fs.promises.open(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
  );
  try {
    const stat = await handle.stat();
    if (!stat.isFile())
      throw fileError('Expected a regular file', 'ERR_FS_NOT_REGULAR');
    if (stat.size > maxBytes)
      throw fileError('Input size cap exceeded', 'ERR_FS_FILE_TOO_LARGE');
    let data;
    if (Number.isFinite(maxBytes)) {
      const chunks = [];
      let length = 0;
      while (length <= maxBytes) {
        const buffer = Buffer.alloc(Math.min(65536, maxBytes + 1 - length));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
        if (bytesRead === 0) break;
        length += bytesRead;
        if (length > maxBytes)
          throw fileError('Input size cap exceeded', 'ERR_FS_FILE_TOO_LARGE');
        chunks.push(buffer.subarray(0, bytesRead));
      }
      data = Buffer.concat(chunks, length);
    } else {
      data = await handle.readFile();
    }
    return { data: encoding ? data.toString(encoding) : data, stat };
  } finally {
    await handle.close();
  }
}

async function readRegularFile(file, options) {
  return (await readFileSnapshot(file, options)).data;
}

function readOptionalFileSync(file, options) {
  try {
    return readRegularFileSync(file, options);
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

function writeExclusiveFileSync(file, data, options = {}) {
  const { fsImpl = fs, mode = 0o600 } = options;
  const fd = fsImpl.openSync(file, 'wx', mode);
  try {
    fsImpl.writeFileSync(fd, data);
  } finally {
    fsImpl.closeSync(fd);
  }
}

// Rename provides atomic visibility. No fsync is performed, so crash durability is not guaranteed.
function atomicWriteFileSync(file, data, options = {}) {
  const { fsImpl = fs } = options;
  let mode = options.mode;
  try {
    const stat = fsImpl.lstatSync(file);
    if (!stat.isFile())
      throw fileError('Expected a regular output file', 'ERR_FS_NOT_REGULAR');
    mode ??= stat.mode & 0o777;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    mode ??= 0o666;
  }
  const directory = privateTempDirSync(
    '.tuturuuu-write-',
    path.dirname(file),
    fsImpl
  );
  const temporary = path.join(directory, 'content');
  try {
    writeExclusiveFileSync(temporary, data, { fsImpl, mode });
    fsImpl.renameSync(temporary, file);
  } finally {
    fsImpl.rmSync(directory, { recursive: true, force: true });
  }
}

module.exports = {
  atomicWriteFileSync,
  privateTempDirSync,
  readFileSnapshot,
  readFileSnapshotSync,
  readOptionalFileSync,
  readRegularFile,
  readRegularFileSync,
  writeExclusiveFileSync,
};
