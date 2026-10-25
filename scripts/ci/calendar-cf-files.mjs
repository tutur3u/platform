import assert from 'node:assert/strict';
import fs from 'node:fs';

export function readCalendarFile(path) {
  const fd = fs.openSync(
    path,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
  );
  try {
    const stat = fs.fstatSync(fd);
    const named = fs.lstatSync(path);
    assert.ok(
      stat.isFile() &&
        named.isFile() &&
        stat.ino !== 0 &&
        stat.dev === named.dev &&
        stat.ino === named.ino,
      'regular Calendar file identity required'
    );
    assert.equal(
      fs.realpathSync(path),
      path,
      'Calendar file must be canonical'
    );
    return { bytes: fs.readFileSync(fd), stat };
  } finally {
    fs.closeSync(fd);
  }
}
