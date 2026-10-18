import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { graphCommandSchema } from '../operational-graph/contracts';
import {
  applyGraphCommand,
  readGraphOutcome,
  readGraphReadiness,
} from '../operational-graph/store';
import { readJsonFile } from './operational-files';
import { fail, operationSchema, slug } from './operational-schema';
import { OperationalStore } from './operational-store';

const writes = [
  'parent',
  'dependency',
  'related',
  'merge',
  'unmerge',
  'close',
  'reopen',
];
const reads = ['show', 'readiness'];
const description = {
  en: 'Explicit offline outcome relationships. Parent organization, dependency readiness, related links and reversible duplicate closure preserve every member. Similarity never grants equivalence or delivery. Writes need a JSON command file, expected revision and stable operation UUID. No auth, network or live verification.',
  vi: 'Quan hệ kết quả ngoại tuyến rõ ràng. Cấu trúc cha con, điều kiện phụ thuộc, liên kết liên quan và đóng bản trùng có thể hoàn tác giữ nguyên từng bản ghi. Độ tương đồng không xác nhận tương đương hoặc triển khai. Ghi cần tệp lệnh JSON, phiên bản dự kiến và UUID thao tác ổn định. Không xác thực, mạng hoặc kiểm chứng trực tiếp.',
};
function parse(args: string[]) {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;
    if (!arg.startsWith('--') && arg !== '-h') {
      positional.push(arg);
      continue;
    }
    const key = arg === '-h' ? 'help' : arg.slice(2);
    if (flags.has(key)) fail('INVALID_INPUT', `duplicate flag --${key}`);
    if (['help', 'json'].includes(key)) flags.set(key, 'true');
    else if (
      ['db', 'file', 'operation-id', 'expected-revision', 'lang'].includes(key)
    ) {
      const value = args[++i];
      if (value === undefined || value.startsWith('--'))
        fail('INVALID_INPUT', `--${key} requires a value`);
      flags.set(key, value);
    } else fail('INVALID_INPUT', `unknown graph flag --${key}`);
  }
  return { positional, flags };
}
function required(flags: Map<string, string>, key: string) {
  const value = flags.get(key);
  if (value === undefined) fail('INVALID_INPUT', `--${key} is required`);
  return value;
}
export function executeGraphCli(args: string[]): unknown {
  const { positional, flags } = parse(args);
  const action = positional[0] ?? 'help';
  const language = z.enum(['en', 'vi']).parse(flags.get('lang') ?? 'en');
  if (action === 'help' || flags.has('help'))
    return {
      version: 1,
      group: 'backlog graph',
      description: description[language],
      commands: [...reads, ...writes],
      usage:
        'ttr backlog graph <show|readiness> ID [--db PATH] [--json] | <parent|dependency|related|merge|unmerge|close|reopen> --file COMMAND.json --expected-revision N --operation-id UUID [--db PATH] [--json]',
      commandFormat: {
        kind: action,
        schema: 'graphCommandSchema',
        mergeConfirmation: 'equivalent',
        closeConfirmation: 'user-confirmed',
        unmergeFence: 'mergeOperationId',
      },
      liveVerificationPerformed: false,
    };
  const writable = writes.includes(action);
  if (!writable && !reads.includes(action))
    fail('INVALID_INPUT', 'unknown graph command');
  if (positional.length !== (writable ? 1 : 2))
    fail('INVALID_INPUT', 'unexpected or missing graph arguments');
  if (
    !writable &&
    ['file', 'expected-revision', 'operation-id'].some((flag) =>
      flags.has(flag)
    )
  )
    fail('INVALID_INPUT', 'write flags do not apply to graph reads');
  const path =
    flags.get('db') ??
    join(
      homedir(),
      '.local/share/tuturuuu/orchestration/programs/platform/backlog.sqlite'
    );
  const id = writable ? undefined : slug.parse(positional[1]);
  const change = writable
    ? graphCommandSchema.parse(readJsonFile(required(flags, 'file')))
    : undefined;
  if (change && change.kind !== action)
    fail('INVALID_INPUT', 'file command kind must match graph action');
  const revision = writable ? required(flags, 'expected-revision') : undefined;
  if (revision !== undefined && !/^(0|[1-9][0-9]*)$/.test(revision))
    fail('INVALID_INPUT', 'expected revision must be a nonnegative integer');
  const operation = writable
    ? operationSchema.parse({
        operationId: required(flags, 'operation-id'),
        expectedRevision: Number(revision),
      })
    : undefined;
  const store = new OperationalStore(path, 'backlog', writable);
  try {
    if (change && operation)
      return applyGraphCommand({ store, change, operation });
    if (action === 'show' && id) return readGraphOutcome({ store, id });
    if (action === 'readiness' && id) return readGraphReadiness({ store, id });
    return fail('INVALID_INPUT', 'incomplete graph command');
  } finally {
    store.close();
  }
}
