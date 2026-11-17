import { readFile, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

// Only the synthetic tenant copy can run with fixture time. Startup guards stay intact.
const target = await realpath(process.argv[2]);
const temporaryRoot = await realpath(tmpdir());
const inside = relative(temporaryRoot, target).split(sep).join('/');
if (
  !/^d241-synthetic-copy-[A-Za-z0-9]+\/verified\/scripts\/auth-ops\/fleet-qa\.mjs$/.test(
    inside
  )
)
  throw new Error('SYNTHETIC_CLOCK_CONTEXT');
const local = await readFile(
  join(dirname(target), 'fleet-qa-local.mjs'),
  'utf8'
);
if (!/export const PROJECT_REF\s*=\s*'abcdefghijklmnopqrst'/.test(local))
  throw new Error('SYNTHETIC_CLOCK_TENANT');
const NativeDate = globalThis.Date;
const fixed = NativeDate.parse('2026-11-16T10:00:00.000Z');
globalThis.Date = new Proxy(NativeDate, {
  construct(target, args, newTarget) {
    return Reflect.construct(target, args.length ? args : [fixed], newTarget);
  },
  apply() {
    return new NativeDate(fixed).toString();
  },
  get(target, key, receiver) {
    if (key === 'now') return () => fixed;
    return Reflect.get(target, key, receiver);
  },
});
process.argv.splice(1, 1);
await import(pathToFileURL(target).href);
