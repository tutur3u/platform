const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

// APFS clones (Bun's default macOS install backend) report full sizes to du
// while sharing physical blocks with ~/.bun/install/cache. getattrlist's
// ATTR_CMNEXT_PRIVATESIZE returns only the bytes no clone shares, which is
// what deleting the file would actually free. Node cannot call getattrlist,
// so the macOS walker runs in the system Python through ctypes.
const APFS_WALKER = `
import ctypes, json, os, struct, sys

class AttrList(ctypes.Structure):
    _fields_ = [('bitmapcount', ctypes.c_ushort), ('reserved', ctypes.c_uint16),
                ('commonattr', ctypes.c_uint32), ('volattr', ctypes.c_uint32),
                ('dirattr', ctypes.c_uint32), ('fileattr', ctypes.c_uint32),
                ('forkattr', ctypes.c_uint32)]

libc = ctypes.CDLL(None, use_errno=True)
getattrlist = libc.getattrlist
getattrlist.argtypes = [ctypes.c_char_p, ctypes.c_void_p, ctypes.c_void_p,
                        ctypes.c_size_t, ctypes.c_ulong]
ATTR_CMNEXT_PRIVATESIZE = 0x8
FSOPT_NOFOLLOW = 0x1
FSOPT_ATTR_CMN_EXTENDED = 0x20
attrs = AttrList(5, 0, 0, 0, 0, 0, ATTR_CMNEXT_PRIVATESIZE)
buf = ctypes.create_string_buffer(16)

def private_size(p):
    if getattrlist(os.fsencode(p), ctypes.byref(attrs), buf, 16,
                   FSOPT_NOFOLLOW | FSOPT_ATTR_CMN_EXTENDED) != 0:
        return 0
    return struct.unpack_from('<Iq', buf.raw)[1]

def walk(job):
    root = job['root']
    exclude = set(job.get('exclude', []))
    dirs = set(job.get('dirs', []))
    sums = {key: [0, 0, 0, 0] for key in list(dirs) + [root]}
    seen = set()
    stack = [(root, root)]
    while stack:
        current, bucket = stack.pop()
        try:
            entries = os.scandir(current)
        except OSError:
            continue
        with entries:
            for entry in entries:
                if entry.path in exclude:
                    continue
                try:
                    st = entry.stat(follow_symlinks=False)
                except OSError:
                    continue
                if entry.is_dir(follow_symlinks=False):
                    stack.append((entry.path, entry.path if entry.path in dirs else bucket))
                    continue
                totals = sums[bucket]
                totals[0] += 1
                if not entry.is_file(follow_symlinks=False):
                    continue
                if st.st_nlink > 1:
                    key = (st.st_dev, st.st_ino)
                    if key in seen:
                        continue
                    seen.add(key)
                totals[1] += st.st_size
                totals[2] += st.st_blocks * 512
                totals[3] += private_size(entry.path)
    return {key: {'files': v[0], 'apparentBytes': v[1], 'allocatedBytes': v[2],
                  'privateBytes': v[3]} for key, v in sums.items()}

json.dump([walk(job) for job in json.load(sys.stdin)], sys.stdout)
`;

function emptyTotals(privateBytes) {
  return {
    allocatedBytes: 0,
    apparentBytes: 0,
    files: 0,
    privateBytes,
  };
}

/**
 * Walks `root`, attributing every entry to the deepest listed `dirs` entry
 * that contains it (or to `root`). Hard links count once per walk; symlinks
 * count as entries without size; `exclude` paths are skipped entirely.
 */
function measureTreeAllocated({ dirs = [], exclude = [], fsImpl = fs, root }) {
  const dirSet = new Set(dirs);
  const excludeSet = new Set(exclude);
  const sums = new Map([...dirs, root].map((key) => [key, emptyTotals(null)]));
  const seen = new Set();
  const stack = [[root, root]];

  while (stack.length > 0) {
    const [current, bucket] = stack.pop();
    let entries;

    try {
      entries = fsImpl.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (excludeSet.has(entryPath)) continue;

      if (entry.isDirectory()) {
        stack.push([entryPath, dirSet.has(entryPath) ? entryPath : bucket]);
        continue;
      }

      const totals = sums.get(bucket);
      totals.files += 1;
      if (!entry.isFile()) continue;

      let stat;
      try {
        stat = fsImpl.lstatSync(entryPath);
      } catch {
        continue;
      }

      if (stat.nlink > 1) {
        const key = `${stat.dev}:${stat.ino}`;
        if (seen.has(key)) continue;
        seen.add(key);
      }

      totals.apparentBytes += stat.size;
      totals.allocatedBytes +=
        (stat.blocks ?? Math.ceil(stat.size / 512)) * 512;
    }
  }

  return Object.fromEntries(sums);
}

function canMeasureApfsPrivate({ platform = process.platform } = {}) {
  if (platform !== 'darwin') return false;
  const probe = spawnSync('python3', ['-I', '-c', 'import ctypes'], {
    stdio: 'ignore',
  });
  return probe.status === 0;
}

/**
 * Measures several trees in one Python process on macOS and returns, per job,
 * the same bucket map as measureTreeAllocated plus APFS private bytes.
 */
function measureTreesApfsPrivate(jobs) {
  const result = spawnSync('python3', ['-I', '-c', APFS_WALKER], {
    encoding: 'utf8',
    input: JSON.stringify(jobs),
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.status !== 0) {
    throw new Error(
      `APFS private-size walker failed: ${result.stderr || result.error}`
    );
  }

  return JSON.parse(result.stdout);
}

function measureTrees(jobs, { apfsPrivate = false, fsImpl = fs } = {}) {
  if (apfsPrivate) return measureTreesApfsPrivate(jobs);
  return jobs.map((job) => measureTreeAllocated({ ...job, fsImpl }));
}

module.exports = {
  canMeasureApfsPrivate,
  measureTreeAllocated,
  measureTrees,
  measureTreesApfsPrivate,
};
