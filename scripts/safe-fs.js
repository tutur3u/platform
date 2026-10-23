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

function readFileSnapshotSync(file, options = {}) {
  const { fsImpl = fs, encoding = null, maxBytes = Infinity } = options;
  const fd = fsImpl.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
  );
  try {
    const stat = fsImpl.fstatSync(fd);
    if (!stat.isFile()) throw new Error('Expected a regular file');
    if (stat.size > maxBytes) throw new Error('Input size cap exceeded');
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
        if (length > maxBytes) throw new Error('Input size cap exceeded');
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
    if (!stat.isFile()) throw new Error('Expected a regular file');
    if (stat.size > maxBytes) throw new Error('Input size cap exceeded');
    let data;
    if (Number.isFinite(maxBytes)) {
      const chunks = [];
      let length = 0;
      while (length <= maxBytes) {
        const buffer = Buffer.alloc(Math.min(65536, maxBytes + 1 - length));
        const { bytesRead } = await handle.read(buffer, 0, buffer.length, null);
        if (bytesRead === 0) break;
        length += bytesRead;
        if (length > maxBytes) throw new Error('Input size cap exceeded');
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

function atomicWriteFileSync(file, data, options = {}) {
  const { fsImpl = fs } = options;
  let mode = options.mode;
  if (mode === undefined) {
    try {
      const stat = fsImpl.lstatSync(file);
      if (!stat.isFile()) throw new Error('Expected a regular output file');
      mode = stat.mode & 0o777;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      mode = 0o666 & ~process.umask();
    }
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
