import { createHash, randomUUID } from 'node:crypto';
import { freemem } from 'node:os';
import {
  PLAYGROUND_LANGUAGES,
  type PlaygroundLanguage,
} from '@tuturuuu/types/primitives/playgrounds';
import {
  PlaygroundFiles,
  PlaygroundJob,
  type PlaygroundJobPayload,
} from '@tuturuuu/utils/playground-schema';
import { judgeLanguageBinary } from './devbox-judge-languages';
import {
  createJudgeDockerArgs,
  type JudgeResourceLimits,
  readJudgeDockerCapacity,
} from './devbox-judge-sandbox';
import {
  PLAYGROUND_EXPORT_BYTES,
  PLAYGROUND_EXPORT_SCRIPT,
  PLAYGROUND_PREVIEW_SCRIPT,
  PLAYGROUND_SYNC_SCRIPT,
} from './devbox-playground-files';
import {
  syntheticContainerLoggingArgs,
  syntheticContainerStartFailure,
} from './devbox-playground-runtime-diagnostics';
import { sandboxDocker } from './devbox-sandbox-process';

const PLAYGROUND_PATH =
  '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
const IMAGE = /^[-\w./:]+@sha256:[a-f0-9]{64}$/;
const POOL_OWNER = process.env.TUTURUUU_PLAYGROUND_POOL_ID;
const PREFIX = `ttr-playground-${POOL_OWNER ?? 'unconfigured'}-`;
function validatePoolOwner() {
  if (!POOL_OWNER || !/^[a-zA-Z0-9_-]{1,40}$/.test(POOL_OWNER))
    throw new Error('A unique managed playground pool identity is required');
}
const IDLE_MS = 15 * 60_000;
const MAX_AGE_MS = 2 * 60 * 60_000;
const environments = new Map<
  string,
  {
    name: string;
    language: PlaygroundLanguage;
    image: string;
    ready: boolean;
    createdAt: number;
    touchedAt: number;
    timer: ReturnType<typeof setTimeout>;
  }
>();
let cleanup: Promise<void> | null = null;
let creating = Promise.resolve();
export function parsePlaygroundImages(
  raw = process.env.TUTURUUU_PLAYGROUND_IMAGES
) {
  const values: unknown = raw ? JSON.parse(raw) : {};
  if (!values || typeof values !== 'object' || Array.isArray(values))
    throw new Error('Invalid playground image configuration');
  const images: Partial<Record<PlaygroundLanguage, string>> = {};
  for (const [key, value] of Object.entries(values)) {
    if (
      !PLAYGROUND_LANGUAGES.includes(key as PlaygroundLanguage) ||
      typeof value !== 'string' ||
      !IMAGE.test(value)
    )
      throw new Error(
        'Playground images must use approved language keys and pinned digests'
      );
    images[key as PlaygroundLanguage] = value;
  }
  return images;
}
export function createPlaygroundDockerArgs(
  projectId: string,
  language: PlaygroundLanguage,
  image: string,
  limits: JudgeResourceLimits,
  capacity: { hostCpus: number; hostMemoryBytes: number }
) {
  if (!/^[0-9a-f-]{36}$/.test(projectId) || !IMAGE.test(image))
    throw new Error('Invalid playground identity');
  const judgeArgs = createJudgeDockerArgs({
    image,
    language: language === 'shell' ? 'python' : language,
    limits,
    name: PREFIX + projectId,
    source: '',
    ...capacity,
    freeMemoryBytes: freemem(),
  });
  const imageIndex = judgeArgs.indexOf(image);
  const syntheticLogs = syntheticContainerLoggingArgs(
    POOL_OWNER ?? '',
    process.env.TTR_PLAYGROUND_ACCEPTANCE === 'true'
  );
  const args = judgeArgs
    .slice(0, imageIndex)
    .filter(
      (arg) =>
        !['--rm', '--interactive', '--network=none', '--workdir=/tmp'].includes(
          arg
        ) && !(syntheticLogs.length > 0 && arg === '--log-driver=none')
    );
  const network = process.env.TUTURUUU_PLAYGROUND_NETWORK;
  if (network && !/^[a-zA-Z0-9_.-]{1,80}$/.test(network))
    throw new Error('Invalid managed playground network');
  return [
    ...args,
    ...syntheticLogs,
    '--detach',
    `--network=${network || 'none'}`,
    '--label=ttr.playground=true',
    `--label=ttr.pool=${POOL_OWNER}`,
    `--label=ttr.created=${Date.now()}`,
    '--workdir=/project',
    `--tmpfs=/project:rw,nosuid,size=${Math.min(512, Math.floor(limits.sandbox_memory_mb / 2))}m,uid=65534,gid=65534`,
    `--env=PATH=${PLAYGROUND_PATH}`,
    '--env=GOCACHE=/tmp/go-cache',
    '--env=GOMODCACHE=/tmp/go-mod',
    '--env=GOTOOLCHAIN=local',
    image,
    'sh',
    '-c',
    'exec sleep 7200',
  ];
}
async function removeContainer(target: string, filter: string) {
  const removed = await sandboxDocker(['rm', '--force', target]);
  if (removed.code === 0 && !removed.exceeded && !removed.timedOut) return;
  // A missing container is idempotent success only after a healthy inventory
  // confirms absence. Engine/permission failures must retain capacity ownership.
  const remaining = await sandboxDocker(['ps', '-aq', '--filter', filter]);
  if (
    remaining.code !== 0 ||
    remaining.exceeded ||
    remaining.timedOut ||
    remaining.output.trim()
  )
    throw new Error('Could not remove isolated playground');
}
async function removeEnvironment(projectId: string) {
  const entry = environments.get(projectId);
  const name = entry?.name ?? PREFIX + projectId;
  await removeContainer(name, `name=^/${name}$`);
  if (entry && environments.get(projectId) === entry) {
    clearTimeout(entry.timer);
    environments.delete(projectId);
  }
}
function touch(projectId: string) {
  const entry = environments.get(projectId);
  if (!entry) return;
  clearTimeout(entry.timer);
  entry.touchedAt = Date.now();
  entry.timer = setTimeout(
    () => {
      void withProjectRun(projectId, () =>
        withPoolLock(async () => {
          // A queued eviction must never remove a replacement or freshly reused entry.
          if (environments.get(projectId) !== entry) return;
          if (
            Date.now() - entry.createdAt < MAX_AGE_MS &&
            Date.now() - entry.touchedAt < IDLE_MS
          )
            return;
          await removeEnvironment(projectId);
        })
      ).catch(() => {});
    },
    Math.min(IDLE_MS, MAX_AGE_MS - (Date.now() - entry.createdAt))
  );
  entry.timer.unref();
}
async function clearOrphanedEnvironments() {
  const result = await sandboxDocker([
    'ps',
    '-aq',
    '--filter',
    `label=ttr.pool=${POOL_OWNER}`,
  ]);
  if (result.code !== 0 || result.exceeded || result.timedOut)
    throw new Error('Playground Docker inventory failed');
  for (const id of result.output.trim().split('\n').filter(Boolean)) {
    if (/^[0-9a-f]{12,64}$/.test(id)) await removeContainer(id, `id=${id}`);
  }
}
async function withPoolLock<T>(action: () => Promise<T>, bounded = false) {
  const previous = creating;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  creating = previous.then(() => gate);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      previous,
      ...(bounded
        ? [
            new Promise<never>((_, reject) => {
              timer = setTimeout(
                () =>
                  reject(
                    new Error(
                      'Playground creation is still pending; stop was not confirmed'
                    )
                  ),
                15_000
              );
            }),
          ]
        : []),
    ]);
    return await action();
  } finally {
    if (timer) clearTimeout(timer);
    // The chain still awaits previous even after a bounded acquisition times out.
    release();
  }
}
const runningProjects = new Map<
  string,
  { tail: Promise<void>; generation: number }
>();
async function withProjectRun<T>(projectId: string, action: () => Promise<T>) {
  const existing = runningProjects.get(projectId);
  const state = existing ?? { tail: Promise.resolve(), generation: 0 };
  const generation = state.generation;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previous = existing?.tail;
  const tail = previous ? previous.then(() => gate) : gate;
  state.tail = tail;
  runningProjects.set(projectId, state);
  if (previous) await previous;
  try {
    if (generation !== state.generation)
      throw new Error('Playground run was stopped before execution');
    return await action();
  } finally {
    release();
    if (state.tail === tail) runningProjects.delete(projectId);
  }
}
async function ensureEnvironment(
  payload: PlaygroundJobPayload,
  limits: JudgeResourceLimits
) {
  return withPoolLock(async () => {
    validatePoolOwner();
    cleanup ??= clearOrphanedEnvironments().catch((error) => {
      cleanup = null;
      throw error;
    });
    await cleanup;
    const image = parsePlaygroundImages()[payload.language];
    if (!image) throw new Error('Language unavailable');
    let entry = environments.get(payload.projectId);
    if (
      entry &&
      (!entry.ready ||
        entry.language !== payload.language ||
        entry.image !== image ||
        Date.now() - entry.createdAt >=
          MAX_AGE_MS - limits.sandbox_timeout_seconds * 1000 - 60_000)
    ) {
      await removeEnvironment(payload.projectId);
      entry = undefined;
    }
    if (entry) {
      const running = await sandboxDocker([
        'inspect',
        '--format',
        '{{.State.Running}}',
        entry.name,
      ]);
      if (running.code === 0 && running.output.trim() === 'true') {
        touch(payload.projectId);
        return entry.name;
      }
      await removeEnvironment(payload.projectId);
    }
    if (payload.operation !== 'run')
      throw new Error(
        'Playground environment is asleep; run the project first'
      );
    const maximum = Math.min(limits.max_sandboxes, limits.max_instances);
    if (environments.size >= maximum)
      throw new Error('Playground runner is at capacity');
    const capacity = await readJudgeDockerCapacity();
    const started = await sandboxDocker(
      createPlaygroundDockerArgs(
        payload.projectId,
        payload.language,
        image,
        limits,
        capacity
      )
    );
    const name = PREFIX + payload.projectId;
    const timer = setTimeout(() => {}, 0);
    clearTimeout(timer);
    environments.set(payload.projectId, {
      name,
      language: payload.language,
      image,
      ready: started.code === 0 && !started.timedOut && !started.exceeded,
      createdAt: Date.now(),
      touchedAt: Date.now(),
      timer,
    });
    touch(payload.projectId);
    if (started.code !== 0 || started.timedOut || started.exceeded) {
      const diagnostic = syntheticContainerStartFailure(
        POOL_OWNER ?? '',
        process.env.TTR_PLAYGROUND_ACCEPTANCE === 'true',
        started
      );
      if (diagnostic)
        console.error(
          'Synthetic acceptance Docker create diagnostic',
          diagnostic
        );
      // Docker may have created the named container before its CLI failed.
      // Keep the entry quarantined and capacity owned if removal is unconfirmed.
      await removeEnvironment(payload.projectId);
      throw new Error('Could not start isolated playground');
    }
    return name;
  });
}
export async function getPlaygroundReadiness() {
  try {
    validatePoolOwner();
    const images = parsePlaygroundImages();
    await readJudgeDockerCapacity();
    const languages: PlaygroundLanguage[] = [];
    for (const [language, image] of Object.entries(images)) {
      const name = `ttr-playground-smoke-${randomUUID()}`;
      const run = await sandboxDocker(
        [
          'run',
          '--rm',
          '--pull=never',
          '--runtime=runsc',
          `--name=${name}`,
          '--network=none',
          '--read-only',
          '--cap-drop=ALL',
          '--security-opt=no-new-privileges',
          '--user=65534:65534',
          '--memory=128m',
          '--memory-swap=128m',
          '--cpus=0.25',
          '--pids-limit=32',
          `--env=PATH=${PLAYGROUND_PATH}`,
          image,
          'sh',
          '-c',
          `command -v python3 >/dev/null && command -v ${language === 'shell' ? 'sh' : judgeLanguageBinary(language as Exclude<PlaygroundLanguage, 'shell'>)} >/dev/null`,
        ],
        '',
        15000
      );
      await removeContainer(name, `name=^/${name}$`);
      if (run.code === 0) languages.push(language as PlaygroundLanguage);
    }
    return {
      ready: languages.length > 0,
      languages,
      environments: environments.size,
    };
  } catch {
    return {
      ready: false,
      languages: [] as PlaygroundLanguage[],
      environments: environments.size,
    };
  }
}
export function playgroundEnvironmentCount() {
  return environments.size;
}
export async function runPlaygroundJob(
  encoded: string,
  limits: JudgeResourceLimits,
  save?: (delta: {
    files: { path: string; content: string }[];
    paths: string[];
  }) => Promise<void>
) {
  if (encoded.length > 4_000_000)
    throw new Error('Playground job exceeds limit');
  const payload = PlaygroundJob.parse(
    JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))
  );
  validatePoolOwner();
  if (payload.operation === 'stop') {
    const running = runningProjects.get(payload.projectId);
    if (running) running.generation++;
    // Wait only for admitted creation, never the arbitrary user command.
    await withPoolLock(() => removeEnvironment(payload.projectId), true);
    return { code: 0, output: '', files: null, preview: null };
  }
  if (payload.operation === 'run')
    return withProjectRun(payload.projectId, () =>
      executePlayground(payload, limits, save)
    );
  return executePlayground(payload, limits, save);
}
async function executePlayground(
  payload: PlaygroundJobPayload,
  limits: JudgeResourceLimits,
  save?: (delta: {
    files: { path: string; content: string }[];
    paths: string[];
  }) => Promise<void>
) {
  const name = await ensureEnvironment(payload, limits);
  if (payload.operation === 'preview') {
    const url = `http://127.0.0.1:${payload.port}${payload.path}`;
    const preview = await sandboxDocker(
      [
        'exec',
        name,
        'python3',
        '-I',
        '-S',
        '-B',
        '-c',
        PLAYGROUND_PREVIEW_SCRIPT,
        url,
      ],
      '',
      8000,
      750000
    );
    if (preview.code !== 0 || preview.exceeded || preview.timedOut)
      throw new Error('Preview unavailable');
    return { code: 0, output: '', files: null, preview: preview.output };
  }
  const sync = await sandboxDocker(
    [
      'exec',
      '--interactive',
      name,
      'python3',
      '-I',
      '-S',
      '-B',
      '-c',
      PLAYGROUND_SYNC_SCRIPT,
    ],
    JSON.stringify({ files: payload.files })
  );
  if (sync.code !== 0) {
    await removeEnvironment(payload.projectId);
    throw new Error('Could not synchronize project files');
  }
  let lastHash = createHash('sha256')
    .update(
      JSON.stringify(
        [...payload.files!].sort((a, b) => a.path.localeCompare(b.path))
      )
    )
    .digest('hex');
  let previousFiles = new Map(
    payload.files!.map((file) => [file.path, file.content])
  );
  let saveChain = Promise.resolve();
  let snapshotFailed = false;
  const snapshot = async () => {
    const exported = await sandboxDocker(
      [
        'exec',
        name,
        'python3',
        '-I',
        '-S',
        '-B',
        '-c',
        PLAYGROUND_EXPORT_SCRIPT,
      ],
      '',
      15_000,
      PLAYGROUND_EXPORT_BYTES
    );
    if (exported.code !== 0 || exported.exceeded || exported.timedOut) {
      const fileError = exported.stderr.match(
        /ValueError: ((?:Unsupported Drive file path|File exceeds Drive save limit|File grew beyond limit): [^\r\n]{1,240})/u
      )?.[1];
      throw new Error(fileError ?? 'Could not export project files');
    }
    const files = PlaygroundFiles.parse(JSON.parse(exported.output)).sort(
      (a, b) => a.path.localeCompare(b.path)
    );
    const hash = createHash('sha256')
      .update(JSON.stringify(files))
      .digest('hex');
    if (save && hash !== lastHash) {
      await save({
        files: files.filter(
          (file) => previousFiles.get(file.path) !== file.content
        ),
        paths: files.map((file) => file.path),
      });
      previousFiles = new Map(files.map((file) => [file.path, file.content]));
      lastHash = hash;
    }
    return files;
  };
  const background = setInterval(() => {
    saveChain = saveChain
      .then(() => (snapshotFailed ? undefined : snapshot()))
      .then(() => {})
      .catch(() => {
        snapshotFailed = true;
        console.warn(
          'Managed playground background snapshot failed; run persistence is incomplete.'
        );
      });
  }, 30_000);
  let result: Awaited<ReturnType<typeof sandboxDocker>>;
  try {
    result = await sandboxDocker(
      ['exec', '--interactive', name, 'sh', '-c', payload.command!],
      payload.stdin ?? '',
      limits.sandbox_timeout_seconds * 1000,
      65536
    );
  } finally {
    clearInterval(background);
    await saveChain;
  }

  if (result.timedOut || result.exceeded) {
    // docker exec CLI termination does not terminate the untrusted process tree.
    await removeEnvironment(payload.projectId);
    throw new Error(
      result.timedOut
        ? 'Playground time limit exceeded'
        : 'Playground output limit exceeded'
    );
  }
  if (snapshotFailed)
    throw new Error(
      'Playground background snapshot failed; project changes were not confirmed saved'
    );
  const files = await snapshot();
  touch(payload.projectId);
  return {
    code: result.code,
    output: result.output + result.stderr,
    files,
    preview: null,
  };
}
