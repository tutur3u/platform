const fs = require('node:fs');
const { randomUUID } = require('node:crypto');

function readOwner(file) {
  const fd = fs.openSync(
    file,
    fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK
  );
  try {
    if (!fs.fstatSync(fd).isFile())
      throw new Error('DEV_PACK_LOCK_REPAIR_REQUIRED');
    const owner = JSON.parse(fs.readFileSync(fd, 'utf8'));
    if (
      !Number.isSafeInteger(owner.pid) ||
      owner.pid <= 0 ||
      typeof owner.nonce !== 'string' ||
      owner.version !== 2 ||
      !Array.isArray(owner.groups) ||
      owner.groups.some((pid) => !Number.isSafeInteger(pid) || pid <= 0)
    )
      throw new Error('DEV_PACK_LOCK_REPAIR_REQUIRED');
    return owner;
  } finally {
    fs.closeSync(fd);
  }
}
function alive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code !== 'ESRCH';
  }
}
function groupAlive(pid) {
  return alive(-pid);
}
function occupied(owner) {
  return alive(owner.pid) || owner.groups.some(groupAlive);
}
function acquirePackLock(file) {
  const owner = {
    version: 2,
    pid: process.pid,
    nonce: randomUUID(),
    groups: [],
  };
  const staged = `${file}.${owner.nonce}.tmp`;
  fs.writeFileSync(staged, JSON.stringify(owner), { mode: 0o600, flag: 'wx' });
  const claim = () => {
    try {
      fs.linkSync(staged, file);
      return true;
    } catch (error) {
      if (error.code === 'EEXIST') return false;
      throw error;
    }
  };
  try {
    if (!claim()) {
      let previous;
      try {
        previous = readOwner(file);
      } catch (error) {
        if (error.code === 'ENOENT') {
          if (!claim()) throw new Error('DEV_PACK_BUSY');
        } else
          throw new Error(
            'DEV_PACK_LOCK_REPAIR_REQUIRED: inspect lock metadata before removing it'
          );
      }
      if (previous) {
        if (occupied(previous))
          throw new Error('DEV_PACK_BUSY: owner is still alive');
        const guard = `${file}.reclaim`;
        try {
          fs.mkdirSync(guard, { mode: 0o700 });
        } catch (error) {
          if (error.code === 'EEXIST')
            throw new Error(
              'DEV_PACK_LOCK_REPAIR_REQUIRED: inspect interrupted reclaim guard'
            );
          throw error;
        }
        try {
          fs.writeFileSync(`${guard}/owner.json`, JSON.stringify(owner), {
            mode: 0o600,
            flag: 'wx',
          });
          const latest = readOwner(file);
          if (latest.nonce !== previous.nonce || occupied(latest))
            throw new Error('DEV_PACK_BUSY: owner changed');
          fs.unlinkSync(file);
          if (!claim())
            throw new Error(
              'DEV_PACK_BUSY: another pack acquired the released lock'
            );
        } finally {
          fs.rmSync(guard, { recursive: true });
        }
      }
    }
    function currentOwner() {
      const current = readOwner(file);
      if (current.nonce !== owner.nonce)
        throw new Error('DEV_PACK_LOCK_OWNERSHIP_CHANGED');
      return current;
    }
    function persist(groups) {
      currentOwner();
      const update = `${file}.${owner.nonce}.update`;
      const fd = fs.openSync(update, 'wx', 0o600);
      try {
        fs.writeFileSync(fd, JSON.stringify({ ...owner, groups }));
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(update, file);
      owner.groups = groups;
    }
    const release = () => {
      const current = currentOwner();
      if (current.groups.some(groupAlive))
        throw new Error(
          'DEV_PACK_BUSY: child group is still alive; lock retained'
        );
      fs.unlinkSync(file);
    };
    release.track = (pid) => {
      if (!Number.isSafeInteger(pid) || pid <= 0)
        throw new Error('INVALID_PACK_PROCESS_GROUP');
      persist([...new Set([...owner.groups, pid])]);
    };
    release.drained = (pid) => {
      if (groupAlive(pid))
        throw new Error(
          'DEV_PACK_BUSY: child group is still alive; lock retained'
        );
      persist(owner.groups.filter((group) => group !== pid));
    };
    return release;
  } finally {
    fs.unlinkSync(staged);
  }
}
module.exports = { acquirePackLock };
