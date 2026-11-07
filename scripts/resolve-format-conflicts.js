#!/usr/bin/env node
// Resolve only conflicts where the incoming main side is a formatting-only edit.
const cp = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function sameIdentity(a, b) {
  return a.dev === b.dev && a.ino === b.ino;
}

function openChecked(root, file, apply) {
  const absolute = path.join(root, file);
  const parents = [];
  let fd;
  const close = () => {
    if (fd !== undefined) fs.closeSync(fd);
    for (const parent of parents) fs.closeSync(parent.fd);
  };
  try {
    if (!fs.constants.O_NOFOLLOW || !fs.constants.O_DIRECTORY)
      throw new Error('No-follow file access is unavailable.');
    let directory = root;
    for (const part of ['', ...file.split('/').slice(0, -1)]) {
      directory = path.join(directory, part);
      const before = fs.lstatSync(directory);
      const directoryFd = fs.openSync(
        directory,
        fs.constants.O_RDONLY |
          fs.constants.O_NOFOLLOW |
          fs.constants.O_DIRECTORY
      );
      parents.push({ path: directory, fd: directoryFd, identity: before });
      if (
        !before.isDirectory() ||
        !sameIdentity(before, fs.fstatSync(directoryFd))
      )
        throw new Error(`Parent changed: ${file}`);
    }
    const before = fs.lstatSync(absolute);
    fd = fs.openSync(
      absolute,
      (apply ? fs.constants.O_RDWR : fs.constants.O_RDONLY) |
        fs.constants.O_NOFOLLOW
    );
    const identity = fs.fstatSync(fd);
    const check = () => {
      for (const parent of parents) {
        const current = fs.lstatSync(parent.path);
        if (
          !current.isDirectory() ||
          !sameIdentity(current, parent.identity) ||
          !sameIdentity(fs.fstatSync(parent.fd), parent.identity) ||
          fs.realpathSync(parent.path) !== parent.path
        )
          throw new Error(`Parent replaced or outside repository: ${file}`);
      }
      const current = fs.lstatSync(absolute);
      const held = fs.fstatSync(fd);
      if (
        !current.isFile() ||
        !held.isFile() ||
        held.nlink !== 1 ||
        !sameIdentity(current, identity) ||
        !sameIdentity(held, identity) ||
        fs.realpathSync(absolute) !== absolute
      )
        throw new Error(`File replaced or unsafe: ${file}`);
    };
    if (
      !before.isFile() ||
      !identity.isFile() ||
      !sameIdentity(before, identity)
    )
      throw new Error(`File changed while opening: ${file}`);
    const read = () => {
      check();
      const size = fs.fstatSync(fd).size;
      if (size > 16 * 1024 * 1024) throw new Error(`File too large: ${file}`);
      const buffer = Buffer.alloc(size);
      let offset = 0;
      while (offset < size) {
        const count = fs.readSync(fd, buffer, offset, size - offset, offset);
        if (!count) throw new Error(`File changed while reading: ${file}`);
        offset += count;
      }
      if (fs.fstatSync(fd).size !== size)
        throw new Error(`File changed: ${file}`);
      check();
      return buffer.toString('utf8');
    };
    check();
    return {
      read,
      close,
      write(original, output) {
        if (!apply || read() !== original)
          throw new Error(`File changed during planning: ${file}`);
        const buffer = Buffer.from(output);
        let offset = 0;
        while (offset < buffer.length) {
          const count = fs.writeSync(
            fd,
            buffer,
            offset,
            buffer.length - offset,
            offset
          );
          if (!count) throw new Error(`Incomplete file write: ${file}`);
          offset += count;
        }
        fs.ftruncateSync(fd, buffer.length);
        check();
      },
    };
  } catch (error) {
    close();
    throw error;
  }
}

function resolve({
  root = process.cwd(),
  main = 'origin/main',
  apply = false,
} = {}) {
  const git = (...args) =>
    cp.execFileSync('git', args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 16 * 1024 * 1024,
    });
  if (git('rev-parse', '--show-toplevel').trim() !== fs.realpathSync(root))
    throw new Error('Run from the repository root.');
  const incoming = git('rev-parse', '--verify', 'MERGE_HEAD').trim();
  if (incoming !== git('rev-parse', '--verify', `${main}^{commit}`).trim())
    throw new Error('MERGE_HEAD must equal the explicitly selected main ref.');
  const head = git('rev-parse', 'HEAD').trim();
  const base = git('merge-base', head, incoming).trim();
  const changed = new Set(
    git('diff', '--name-only', '-z', base, 'HEAD').split('\0')
  );
  const entries = new Map();
  const indexSnapshot = git('ls-files', '--unmerged', '-z');
  for (const entry of indexSnapshot.split('\0').filter(Boolean)) {
    const match = /^(\d+) ([a-f0-9]+) ([123])\t(.+)$/.exec(entry);
    if (!match) throw new Error('Invalid index entry.');
    const [, mode, oid, stage, file] = match;
    if (!entries.has(file)) entries.set(file, []);
    entries.get(file).push({ mode, oid, stage: Number(stage) });
  }
  const plans = [];
  const handles = [];
  try {
    for (const [file, stages] of entries) {
      if (
        !changed.has(file) ||
        !/\.[cm]?[jt]sx?$/.test(file) ||
        /[\x00-\x1f\x7f]/.test(file) ||
        file.startsWith('-') ||
        path.isAbsolute(file) ||
        path.posix.normalize(file) !== file ||
        /(?:routeTree|bridge)\.gen\.ts$/.test(file) ||
        /^(?:apps\/(?:backend|mobile|tanstack-web)\/|apps\/api\/generated\/|\.agents\/)/.test(
          file
        ) ||
        file
          .split('/')
          .some((part) =>
            ['..', '.', '.git', '.worktrees', 'node_modules', 'tmp'].includes(
              part
            )
          )
      )
        throw new Error(`Unsafe or non-PR source path: ${file}`);
      if (stages.length !== 3 || stages.some((s) => s.mode !== '100644'))
        throw new Error(`Add/delete/rename/mode conflict refused: ${file}`);
      // Rename metadata can otherwise look like three ordinary blob stages.
      for (const side of ['HEAD', incoming]) {
        const status = git(
          'diff',
          '--name-status',
          '-M',
          base,
          side,
          '--',
          file
        );
        if (status.split('\n').some((line) => line && !line.startsWith('M\t')))
          throw new Error(`Non-modification conflict refused: ${file}`);
      }
      const handle = openChecked(root, file, apply);
      handles.push(handle);
      const blobs = stages
        .sort((a, b) => a.stage - b.stage)
        .map((s) => git('cat-file', 'blob', s.oid));
      const original = handle.read();
      if ([...blobs, original].some((value) => value.includes('\0')))
        throw new Error(`Binary conflict refused: ${file}`);
      const format = (input) => {
        const result = cp.spawnSync(
          path.join(root, 'node_modules/.bin/oxfmt'),
          [
            '--config',
            path.join(root, '.oxfmtrc.json'),
            '--stdin-filepath',
            file,
          ],
          { cwd: root, input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
        );
        if (result.error || result.status !== 0)
          throw new Error(
            `Formatter refused ${file}: ${result.error?.message ?? result.stderr}`
          );
        return result.stdout;
      };
      if (format(blobs[0]) !== format(blobs[2]))
        throw new Error(`Semantic main-side conflict refused: ${file}`);
      const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'oxc-conflict-'));
      let expected;
      try {
        blobs.forEach((blob, i) =>
          fs.writeFileSync(path.join(temporary, String(i)), blob)
        );
        const result = cp.spawnSync(
          'git',
          [
            'merge-file',
            '-p',
            path.join(temporary, '1'),
            path.join(temporary, '0'),
            path.join(temporary, '2'),
          ],
          { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }
        );
        if (
          !Number.isInteger(result.status) ||
          result.status < 1 ||
          result.status > 127
        )
          throw new Error(`Unexpected merge shape: ${file}`);
        expected = result.stdout;
      } finally {
        fs.rmSync(temporary, { recursive: true, force: true });
      }
      const labels = (text) => text.replace(/^(<{7}|>{7}) .*$/gm, '$1');
      if (labels(original) !== labels(expected))
        throw new Error(`Manually edited conflict refused: ${file}`);
      const output = format(blobs[1]);
      if (/^(<{7}|={7}|>{7})/m.test(output))
        throw new Error(`Conflict markers refused: ${file}`);
      plans.push({ file, handle, original, output });
    }
    if (apply) {
      if (
        git('ls-files', '--unmerged', '-z') !== indexSnapshot ||
        git('rev-parse', 'HEAD').trim() !== head ||
        git('rev-parse', 'MERGE_HEAD').trim() !== incoming
      )
        throw new Error('Merge state changed during planning.');
      for (const plan of plans)
        if (plan.handle.read() !== plan.original)
          throw new Error(`File changed during planning: ${plan.file}`);
      for (const plan of plans) plan.handle.write(plan.original, plan.output);
    }
    return plans.map(({ file }) => file);
  } finally {
    for (const handle of handles) handle.close();
  }
}

if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (
      args.some(
        (arg, i) =>
          !['--apply', '--main'].includes(arg) && args[i - 1] !== '--main'
      )
    )
      throw new Error(
        'Usage: node scripts/resolve-format-conflicts.js [--main origin/main] [--apply]'
      );
    const selected = args.indexOf('--main');
    if (
      selected >= 0 &&
      (!args[selected + 1] || args[selected + 1].startsWith('-'))
    )
      throw new Error('--main requires a ref.');
    const files = resolve({
      main: selected >= 0 ? args[selected + 1] : 'origin/main',
      apply: args.includes('--apply'),
    });
    console.log(
      `${args.includes('--apply') ? 'Formatted' : 'Would format'} ${files.length} conflict(s). Index unchanged; inspect and stage manually.\n${files.join('\n')}`
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { resolve };
