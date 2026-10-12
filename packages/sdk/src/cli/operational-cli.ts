import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { checkEvidence } from './operational-evidence';
import { readJsonFile } from './operational-files';
import {
  fail,
  OperationalError,
  operationSchema,
  slug,
  updateSchema,
} from './operational-schema';
import { initStore, OperationalStore } from './operational-store';
import { exportStore, importStore, migrateStore } from './operational-transfer';

const commands = {
  backlog: [
    'snapshot',
    'history',
    'init',
    'migrate',
    'intake',
    'update',
    'evidence-check',
    'export',
    'import',
  ],
  'operational-memory': [
    'list',
    'get',
    'history',
    'init',
    'put',
    'export',
    'import',
  ],
};
const help = {
  en: 'Local offline operational records. Reads never initialize stores. Writes require --expected-revision and --operation-id. Import defaults to dry-run. No login, network, credentials, customer data or delivery authority.',
  vi: 'Dữ liệu vận hành cục bộ ngoại tuyến. Lệnh đọc không tạo kho. Lệnh ghi cần --expected-revision và --operation-id. Nhập mặc định chỉ kiểm tra. Không đăng nhập, kết nối mạng, thông tin xác thực, dữ liệu khách hàng hoặc quyền triển khai.',
};
const valueFlags = [
  'db',
  'file',
  'expected-revision',
  'operation-id',
  'status',
  'owner',
  'note',
  'link',
  'priority',
  'evidence',
  'lang',
];
const booleanFlags = ['json', 'help', 'apply', 'dry-run'];
function parseArgs(args: string[]) {
  const flags = new Map<string, string>();
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (!arg) continue;
    if (arg === '-h') {
      flags.set('help', 'true');
      continue;
    }
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const key = arg.slice(2);
    if (flags.has(key)) fail('INVALID_INPUT', `duplicate flag --${key}`);
    if (booleanFlags.includes(key)) flags.set(key, 'true');
    else if (valueFlags.includes(key)) {
      const value = args[++i];
      if (value === undefined || value.startsWith('--'))
        fail('INVALID_INPUT', `--${key} requires a value`);
      flags.set(key, value);
    } else fail('INVALID_INPUT', `unknown flag --${key}`);
  }
  return { flags, positional };
}
function required(flags: Map<string, string>, name: string) {
  const value = flags.get(name);
  if (value === undefined) fail('INVALID_INPUT', `--${name} is required`);
  return value;
}
function integer(input: string) {
  if (!/^(0|[1-9][0-9]*)$/.test(input))
    fail('INVALID_INPUT', 'expected a nonnegative integer');
  return z.number().int().nonnegative().parse(Number(input));
}
function operation(flags: Map<string, string>) {
  return operationSchema.parse({
    operationId: required(flags, 'operation-id'),
    expectedRevision: integer(required(flags, 'expected-revision')),
  });
}
const commonFlags = ['db', 'json', 'lang'];
const writeFlags = ['expected-revision', 'operation-id'];
function allowFlags(flags: Map<string, string>, allowed: string[]) {
  for (const key of flags.keys())
    if (![...commonFlags, ...allowed].includes(key))
      fail('INVALID_INPUT', `flag --${key} does not apply to this command`);
}
export function executeOperational(args: string[]): unknown {
  const kind = z.enum(['backlog', 'operational-memory']).parse(args[0]);
  const { flags, positional } = parseArgs(args.slice(1));
  const language = z.enum(['en', 'vi']).parse(flags.get('lang') ?? 'en');
  const command = positional[0] ?? 'help';
  if (command === 'help' || flags.has('help'))
    return {
      version: 1,
      group: kind,
      description: help[language],
      commands: commands[kind],
      usage: `ttr ${kind} COMMAND [ID] [--db PATH] [--file FILE] [--expected-revision N --operation-id UUID] [--json] [--lang en|vi]`,
      liveVerificationPerformed: false,
    };
  if (!commands[kind].includes(command))
    fail('INVALID_INPUT', 'unknown local command');
  const needsId = ['history', 'get', 'update'].includes(command);
  if (positional.length !== (needsId ? 2 : 1))
    fail('INVALID_INPUT', 'unexpected or missing positional arguments');
  const id = needsId ? slug.parse(positional[1]) : undefined;
  const path =
    flags.get('db') ??
    join(
      homedir(),
      '.local/share/tuturuuu/orchestration/programs/platform',
      kind === 'backlog' ? 'backlog.sqlite' : 'operational-memory.sqlite'
    );
  const allowed: Record<string, string[]> = {
    snapshot: [],
    list: [],
    get: [],
    history: [],
    init: [],
    migrate: ['file', ...writeFlags],
    intake: ['file', ...writeFlags],
    update: [
      'status',
      'owner',
      'note',
      'link',
      'priority',
      'evidence',
      ...writeFlags,
    ],
    put: ['file', ...writeFlags],
    'evidence-check': ['file'],
    export: ['file'],
    import: ['file', 'apply', 'dry-run', ...writeFlags],
  };
  allowFlags(flags, allowed[command] ?? []);
  if (command === 'init') {
    required(flags, 'db');
    return initStore(path, kind);
  }
  if (command === 'evidence-check')
    return checkEvidence(readJsonFile(required(flags, 'file')));
  if (command === 'import') {
    required(flags, 'db');
    if (flags.has('apply') && flags.has('dry-run'))
      fail('INVALID_INPUT', 'choose --apply or --dry-run');
    if (!flags.has('apply') && writeFlags.some((f) => flags.has(f)))
      fail('INVALID_INPUT', 'write flags require --apply');
    return importStore(
      path,
      kind,
      readJsonFile(required(flags, 'file')),
      flags.has('apply') ? operation(flags) : undefined
    );
  }
  const writable = ['migrate', 'intake', 'update', 'put'].includes(command);
  const op = writable ? operation(flags) : undefined;
  // Parse all caller files and flags before opening a writable store.
  const input = ['intake', 'put'].includes(command)
    ? readJsonFile(required(flags, 'file'))
    : undefined;
  const change =
    command === 'update'
      ? updateSchema.parse({
          id,
          status: flags.get('status'),
          owner: flags.get('owner'),
          note: flags.get('note'),
          link: flags.get('link'),
          priority: flags.has('priority')
            ? integer(required(flags, 'priority'))
            : undefined,
          evidence: flags.has('evidence')
            ? readJsonFile(required(flags, 'evidence'))
            : undefined,
        })
      : undefined;
  const file = ['export', 'migrate'].includes(command)
    ? required(flags, 'file')
    : undefined;
  const store = new OperationalStore(path, kind, writable);
  try {
    if (command === 'snapshot') return store.snapshot();
    if (command === 'history')
      return store.read(() => ({
        events: store.history(id),
        revision: store.revision(),
        liveVerificationPerformed: false,
      }));
    if (command === 'list' || command === 'get')
      return store.read(() => {
        const notes = [...store.readNotes().values()].sort((a, b) =>
          a.id.localeCompare(b.id, 'en')
        );
        const note = notes.find((n) => n.id === id);
        if (command === 'get' && !note)
          fail('UNKNOWN_ID', 'unknown operational note');
        return {
          records: command === 'get' ? [note] : notes,
          revision: store.revision(),
          sourceDatabaseId: store.identity(),
          liveVerificationPerformed: false,
        };
      });
    if (command === 'export' && file) return exportStore(store, file);
    if (command === 'migrate' && file && op)
      return migrateStore(store, file, op);
    if (command === 'intake' && op) return store.intake(input, op);
    if (command === 'put' && op) return store.putNote(input, op);
    if (command === 'update' && change && op) return store.update(change, op);
    return fail('INVALID_INPUT', 'incomplete command');
  } finally {
    store.close();
  }
}
export async function runOperationalCli(args: string[]) {
  try {
    const result = executeOperational(args);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (
      typeof result === 'object' &&
      result !== null &&
      'recordedEvidenceComplete' in result &&
      result.recordedEvidenceComplete === false
    )
      process.exitCode = 1;
  } catch (error) {
    const code =
      error instanceof OperationalError
        ? error.code
        : error instanceof Error && 'code' in error && error.code === 'ENOENT'
          ? 'STORE_OR_FILE_MISSING'
          : error instanceof z.ZodError || error instanceof SyntaxError
            ? 'INVALID_INPUT'
            : 'STORE_ERROR';
    const message =
      error instanceof OperationalError
        ? error.message
        : 'Local operation failed; inspect input, store path, permissions and runtime compatibility.';
    const result = {
      error: {
        code,
        message,
        messageVi:
          'Thao tác cục bộ thất bại. Kiểm tra dữ liệu đầu vào, đường dẫn kho, quyền truy cập và phiên bản môi trường.',
      },
      liveVerificationPerformed: false,
    };
    if (args.includes('--json'))
      process.stdout.write(`${JSON.stringify(result)}\n`);
    else process.stderr.write(`${code}: ${message}\n`);
    process.exitCode = 2;
  }
}
