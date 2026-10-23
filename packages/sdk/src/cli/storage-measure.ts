import { spawnSync } from 'node:child_process';
import { lstatSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// "Unique" bytes are what deleting a tree would actually free:
// - macOS/APFS: getattrlist ATTR_CMNEXT_PRIVATESIZE, the bytes no clone
//   shares (Bun's clonefile node_modules report 0 here, du reports GiBs).
// - Linux: allocated blocks; a hard-linked file counts once, and as unique
//   only when every link is inside the measured tree.
// `du -L` follows Bun's workspace symlinks and over-reports by 100x; never
// use it. Same method as scripts/worktree-footprint-size.js (#6436), which
// the published CLI cannot import.
const WALKER = `
import ctypes, json, os, struct, sys
jobs = json.load(sys.stdin)
apfs = sys.platform == 'darwin'
if apfs:
    class AttrList(ctypes.Structure):
        _fields_ = [('bitmapcount', ctypes.c_ushort), ('reserved', ctypes.c_uint16),
                    ('commonattr', ctypes.c_uint32), ('volattr', ctypes.c_uint32),
                    ('dirattr', ctypes.c_uint32), ('fileattr', ctypes.c_uint32),
                    ('forkattr', ctypes.c_uint32)]
    libc = ctypes.CDLL(None, use_errno=True)
    getattrlist = libc.getattrlist
    getattrlist.argtypes = [ctypes.c_char_p, ctypes.c_void_p, ctypes.c_void_p,
                            ctypes.c_size_t, ctypes.c_ulong]
    attrs = AttrList(5, 0, 0, 0, 0, 0, 0x8)
    buf = ctypes.create_string_buffer(16)
    def private_size(p):
        if getattrlist(os.fsencode(p), ctypes.byref(attrs), buf, 16, 0x1 | 0x20) != 0:
            return 0
        return struct.unpack_from('<Iq', buf.raw)[1]
out = []
for job in jobs:
    exclude = set(job.get('exclude', []))
    cap = job.get('maxEntries', 0)
    files = apparent = allocated = unique = 0
    links = {}
    truncated = False
    stack = [job['root']]
    while stack and not truncated:
        current = stack.pop()
        try:
            entries = os.scandir(current)
        except OSError:
            continue
        with entries:
            for entry in entries:
                if entry.path in exclude:
                    continue
                files += 1
                if cap and files > cap:
                    truncated = True
                    break
                try:
                    if entry.is_dir(follow_symlinks=False):
                        stack.append(entry.path)
                        continue
                    if not entry.is_file(follow_symlinks=False):
                        continue
                    st = entry.stat(follow_symlinks=False)
                except OSError:
                    continue
                freed = private_size(entry.path) if apfs else st.st_blocks * 512
                if st.st_nlink > 1:
                    key = (st.st_dev, st.st_ino)
                    link = links.get(key)
                    if link:
                        link[0] += 1
                        continue
                    links[key] = [1, st.st_nlink, freed]
                else:
                    unique += freed
                apparent += st.st_size
                allocated += st.st_blocks * 512
    # A hard-linked file is freed only when every link lives in this tree.
    unique += sum(freed for seen, nlink, freed in links.values() if seen >= nlink)
    out.append({'files': files, 'apparentBytes': apparent, 'allocatedBytes': allocated,
                'uniqueBytes': unique, 'truncated': truncated})
json.dump({'method': 'apfs-private' if apfs else 'allocated-dedup', 'results': out}, sys.stdout)
`;

export type MeasureMethod = 'apfs-private' | 'allocated-dedup';

export interface MeasureJob {
  root: string;
  exclude?: string[];
  maxEntries?: number;
}

export interface TreeMeasure {
  files: number;
  apparentBytes: number;
  allocatedBytes: number;
  uniqueBytes: number;
  truncated: boolean;
}

export interface MeasureResult {
  method: MeasureMethod;
  results: TreeMeasure[];
}

export type Measurer = (jobs: MeasureJob[]) => MeasureResult;

/**
 * Per job: hard links count once toward allocated bytes, and toward unique
 * bytes only when every link lives inside the tree (deleting it frees them).
 */
export function measureTreesFallback(jobs: MeasureJob[]): MeasureResult {
  return {
    method: 'allocated-dedup',
    results: jobs.map((job) => {
      const exclude = new Set(job.exclude ?? []);
      const links = new Map<
        string,
        { seen: number; nlink: number; bytes: number }
      >();
      const totals: TreeMeasure = {
        files: 0,
        apparentBytes: 0,
        allocatedBytes: 0,
        uniqueBytes: 0,
        truncated: false,
      };
      const stack = [job.root];
      while (stack.length && !totals.truncated) {
        const current = stack.pop()!;
        let entries: import('node:fs').Dirent[];
        try {
          entries = readdirSync(current, { withFileTypes: true });
        } catch {
          continue;
        }
        for (const entry of entries) {
          const target = join(current, entry.name);
          if (exclude.has(target)) continue;
          totals.files += 1;
          if (job.maxEntries && totals.files > job.maxEntries) {
            totals.truncated = true;
            break;
          }
          if (entry.isDirectory()) {
            stack.push(target);
            continue;
          }
          if (!entry.isFile()) continue;
          let info: import('node:fs').Stats;
          try {
            info = lstatSync(target);
          } catch {
            continue;
          }
          const bytes = (info.blocks ?? Math.ceil(info.size / 512)) * 512;
          if (info.nlink > 1) {
            const key = `${info.dev}:${info.ino}`;
            const link = links.get(key);
            if (link) {
              link.seen += 1;
              continue;
            }
            links.set(key, { seen: 1, nlink: info.nlink, bytes });
          } else totals.uniqueBytes += bytes;
          totals.apparentBytes += info.size;
          totals.allocatedBytes += bytes;
        }
      }
      for (const link of links.values())
        if (link.seen >= link.nlink) totals.uniqueBytes += link.bytes;
      return totals;
    }),
  };
}

/**
 * Measures every job in one system Python process (APFS private size needs
 * getattrlist, which Node cannot call). Falls back to the in-process
 * allocated walker when Python is unavailable.
 */
export function measureTrees(
  jobs: MeasureJob[],
  { timeoutMs = 15 * 60_000 }: { timeoutMs?: number } = {}
): MeasureResult {
  if (!jobs.length) return { method: defaultMethod(), results: [] };
  const python = process.platform === 'darwin' ? '/usr/bin/python3' : 'python3';
  const result = spawnSync(python, ['-I', '-c', WALKER], {
    encoding: 'utf8',
    input: JSON.stringify(jobs),
    maxBuffer: 16 * 1024 * 1024,
    timeout: timeoutMs,
  });
  if (result.status === 0) {
    try {
      return JSON.parse(result.stdout) as MeasureResult;
    } catch {
      // Fall through to the portable walker.
    }
  }
  return measureTreesFallback(jobs);
}

function defaultMethod(): MeasureMethod {
  return process.platform === 'darwin' ? 'apfs-private' : 'allocated-dedup';
}
