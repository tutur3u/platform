import { join } from 'node:path';
import { z } from 'zod';
import {
  LITERT_RECIPE,
  SEMANTIC_ADMISSION,
  TEXT_LITERT,
} from '../operational-search/artifact';
import {
  assertDerivedPath,
  readCache,
  writeCache,
} from '../operational-search/cache';
import {
  downloadArtifact,
  verifyArtifact,
} from '../operational-search/download';
import {
  buildIndex,
  collectDocuments,
  type ProjectionReader,
} from '../operational-search/index';
import {
  createPythonRuntime,
  inspectRuntimeDirectory,
  MAX_PRIVATE_RUNTIME_BYTES,
  probePythonRuntime,
} from '../operational-search/python-runtime';
import { search } from '../operational-search/query';
import type { EmbeddingRuntime } from '../operational-search/runtime';
import { privateParent } from './operational-files';
import { fail } from './operational-schema';

const actions = ['query', 'index', 'model-status', 'model-prepare'];
const help = {
  en: 'Native local backlog search. Query is offline and falls back to lexical matching. Index is a private derived cache, never an authoritative record. Similarity only suggests uncertain candidates and grants no merge or closure authority. Model download and execution require a verified approved artifact/runtime pair.',
  vi: 'Tìm kiếm backlog cục bộ. Truy vấn ngoại tuyến dùng tìm kiếm từ khóa khi ngữ nghĩa chưa sẵn sàng. Chỉ mục riêng tư là bộ nhớ đệm suy ra. Độ tương tự chỉ gợi ý ứng viên chưa chắc chắn, không cho phép gộp hoặc đóng yêu cầu. Tải và chạy mô hình cần cặp tệp và môi trường đã được xác minh, phê duyệt.',
};

export async function runOperationalSearch(
  args: string[],
  injected?: { readProjection?: ProjectionReader; runtime?: EmbeddingRuntime }
) {
  const flags = new Map<string, string>();
  const positional: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const argument = args[i];
    if (!argument) continue;
    if (argument === '-h') {
      flags.set('help', 'true');
      continue;
    }
    if (!argument.startsWith('--')) {
      positional.push(argument);
      continue;
    }
    const key = argument.slice(2);
    if (flags.has(key)) fail('INVALID_INPUT', `duplicate flag --${key}`);
    if (['help', 'json'].includes(key)) flags.set(key, 'true');
    else if (
      ['db', 'cache', 'mode', 'limit', 'lang', 'runtime-dir'].includes(key)
    ) {
      const value = args[++i];
      if (!value || value.startsWith('--'))
        fail('INVALID_INPUT', `--${key} requires a value`);
      flags.set(key, value);
    } else fail('INVALID_INPUT', `unknown search flag --${key}`);
  }
  const language = z.enum(['en', 'vi']).parse(flags.get('lang') ?? 'en');
  const action = positional[0];
  if (flags.has('help') || !action || action === 'help')
    return {
      ok: true,
      group: 'backlog search',
      commands: actions,
      help: help[language],
      examples: [
        'ttr backlog search query "calendar RSVP" --db /private/path/backlog.sqlite --json',
        'ttr backlog search index --db /private/path/backlog.sqlite --cache /private/path/search/index.json --json',
        'ttr backlog search model-status --json',
      ],
      liveVerificationPerformed: false,
    };
  if (!actions.includes(action)) fail('INVALID_INPUT', 'unknown search action');
  const allowed =
    action === 'query'
      ? ['db', 'cache', 'mode', 'limit', 'lang', 'json', 'runtime-dir']
      : action === 'index'
        ? ['db', 'cache', 'lang', 'json', 'runtime-dir']
        : ['lang', 'json', 'runtime-dir'];
  for (const flag of flags.keys())
    if (!allowed.includes(flag))
      fail('INVALID_INPUT', `--${flag} is not valid for ${action}`);
  if (positional.length > (action === 'query' ? 2 : 1))
    fail('INVALID_INPUT', 'unexpected search positional arguments');
  const runtimeDirectory = flags.get('runtime-dir');
  if (action === 'model-status') {
    let ready = false;
    if (runtimeDirectory) {
      try {
        const runtime = await createPythonRuntime(runtimeDirectory);
        ready = Boolean(runtime.fingerprint);
      } catch {
        ready = false;
      }
    }
    return {
      ok: true,
      status: ready ? 'prepared' : 'preparation',
      ready,
      admission: SEMANTIC_ADMISSION,
      artifact: TEXT_LITERT,
      recipe: LITERT_RECIPE,
      downloadPerformed: false,
      runtimeExecuted: false,
      runtimeProbePerformed: Boolean(runtimeDirectory),
      modelLoaded: false,
      liveVerificationPerformed: false,
    };
  }
  if (action === 'model-prepare') {
    if (!runtimeDirectory)
      fail(
        'INVALID_INPUT',
        '--runtime-dir must identify the isolated verified runtime'
      );
    if (!SEMANTIC_ADMISSION.allowed)
      fail('SEMANTIC_ADMISSION_HELD', SEMANTIC_ADMISSION.reason);
    const runtimeProof = await probePythonRuntime(runtimeDirectory);
    const capacity = inspectRuntimeDirectory(runtimeDirectory);
    if (
      capacity.headroomBytes < 4 * 1024 ** 3 ||
      capacity.bytes + TEXT_LITERT.bytes > MAX_PRIVATE_RUNTIME_BYTES
    )
      fail(
        'RUNTIME_CAPACITY',
        'model admission requires 4 GiB fresh disk headroom and total private cache at most 512 MiB'
      );
    const modelPath = join(runtimeProof.root, 'models', TEXT_LITERT.filename);
    privateParent(modelPath);
    const receipt = await downloadArtifact({
      path: modelPath,
      artifact: TEXT_LITERT,
    });
    await verifyArtifact(modelPath, TEXT_LITERT);
    return {
      ok: true,
      artifact: TEXT_LITERT,
      recipe: LITERT_RECIPE,
      runtimeProof,
      receipt,
      modelLoaded: false,
      ready: true,
      liveVerificationPerformed: false,
    };
  }
  const path = flags.get('db');
  if (!path)
    fail(
      'INVALID_INPUT',
      '--db is required; search never initializes or adopts a store'
    );
  const readProjection =
    injected?.readProjection ??
    (await import('../operational-graph/reader.js'))
      .readOutcomeProjectionPageFromPath;
  const cachePath = flags.get('cache');
  if (cachePath) assertDerivedPath(path, cachePath);
  let runtime = injected?.runtime;
  let runtimeFallback: string | null = null;
  if (!runtime && runtimeDirectory) {
    try {
      runtime = await createPythonRuntime(runtimeDirectory);
    } catch {
      runtimeFallback = 'LOCAL_RUNTIME_UNAVAILABLE';
    }
  }
  if (action === 'index') {
    if (!cachePath) fail('INVALID_INPUT', '--cache is required');
    let cache: Awaited<ReturnType<typeof buildIndex>>;
    try {
      cache = await buildIndex({ path, readProjection, runtime });
    } catch (error) {
      if (!runtime) throw error;
      runtimeFallback = 'LOCAL_EMBEDDING_FAILED';
      cache = await buildIndex({ path, readProjection });
    }
    const current = await readProjection({ path, limit: 1 });
    if (
      current.sourceDatabaseId !== cache.sourceDatabaseId ||
      current.revision !== cache.revision ||
      current.snapshotHash !== cache.snapshotHash
    )
      fail(
        'PROJECTION_REVISION_CONFLICT',
        'source changed while building the index'
      );
    writeCache(cachePath, cache);
    return {
      ok: true,
      sourceDatabaseId: cache.sourceDatabaseId,
      revision: cache.revision,
      indexed: cache.documents.length,
      embedded: cache.vectors.length,
      incremental: false,
      invalidation: 'full snapshot',
      modelFingerprint: cache.modelFingerprint,
      runtimeFallback,
      runtimeKind: injected?.runtime
        ? 'injected'
        : runtime
          ? 'litert-local'
          : 'none',
      modelLoaded: !injected?.runtime && cache.vectors.length > 0,
      liveVerificationPerformed: false,
    };
  }
  const query = positional[1];
  if (!query) fail('INVALID_INPUT', 'query text is required');
  const mode = z
    .enum(['lexical', 'hybrid', 'semantic'])
    .parse(flags.get('mode') ?? 'hybrid');
  const rawLimit = flags.get('limit') ?? '10';
  if (!/^[1-9][0-9]*$/.test(rawLimit))
    fail('INVALID_INPUT', '--limit must be an integer 1..100');
  const limit = z.number().int().min(1).max(100).parse(Number(rawLimit));
  const source = await collectDocuments({ path, readProjection });
  let cache: ReturnType<typeof readCache> | undefined;
  let cacheStatus = 'absent';
  if (cachePath) {
    try {
      cache = readCache(cachePath);
      cacheStatus = 'current';
    } catch {
      cacheStatus = 'unavailable';
    }
  }
  if (
    cache &&
    (cache.sourceDatabaseId !== source.sourceDatabaseId ||
      cache.revision !== source.revision ||
      cache.snapshotHash !== source.snapshotHash ||
      cache.projectionVersion !== source.projectionVersion)
  ) {
    cache = undefined;
    cacheStatus = 'stale';
  }
  const result = await search({
    documents: source.documents,
    vectors: cache?.vectors,
    modelFingerprint: cache?.modelFingerprint,
    query,
    mode,
    limit,
    runtime,
  });
  return {
    ok: true,
    sourceDatabaseId: source.sourceDatabaseId,
    revision: source.revision,
    snapshotHash: source.snapshotHash,
    cacheStatus,
    runtimeFallback,
    ...result,
  };
}
