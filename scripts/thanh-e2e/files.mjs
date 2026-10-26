import fs from 'node:fs';

export function ensureFirebaseConfig(target, contents) {
  try {
    fs.writeFileSync(target, contents, { flag: 'wx', mode: 0o600 });
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}

export function readPidFile(file) {
  let fd;
  try {
    fd = fs.openSync(
      file,
      fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
    );
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > 64)
      throw new Error('PID state must be a regular file of at most 64 bytes');
    const text = fs.readFileSync(fd, 'utf8').trim();
    const pid = Number(text);
    return /^\d+$/u.test(text) && Number.isSafeInteger(pid) && pid > 0
      ? pid
      : null;
  } finally {
    fs.closeSync(fd);
  }
}
