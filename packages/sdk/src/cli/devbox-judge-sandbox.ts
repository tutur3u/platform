import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { cpus, freemem, totalmem } from 'node:os';
import { performance } from 'node:perf_hooks';
import {
  createJudgeLanguageCommand,
  isJudgeLanguage,
  type JudgeLanguage,
  judgeLanguageBinary,
  minimumJudgeMemoryMb,
} from './devbox-judge-languages';

export interface JudgeResourceLimits {
  max_cpu_percent: number;
  max_memory_percent: number;
  max_sandboxes: number;
  max_instances: number;
  sandbox_memory_mb: number;
  sandbox_timeout_seconds: number;
  sandbox_pids: number;
}

export interface JudgeCase {
  expected: string;
  input: string;
  visible: boolean;
}

export interface JudgePayload {
  cases: JudgeCase[];
  language: JudgeLanguage;
  source: string;
}

export type JudgeImages = Partial<Record<JudgeLanguage, string>>;

const IMAGE_REFERENCE = /^[-\w./:]+@sha256:[a-f0-9]{64}$/u;
const MEBIBYTE = 1024 * 1024;

async function dockerMetadata(args: string[], timeoutMs = 4000) {
  const child = spawn('docker', args, {
    shell: false,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => {
    output = (output + String(chunk)).slice(0, 65_536);
  });
  const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
  try {
    const code = await new Promise<number>((resolveExit, reject) => {
      child.on('error', reject);
      child.on('exit', (exitCode) => resolveExit(exitCode ?? 1));
    });
    return { code, output };
  } finally {
    clearTimeout(timer);
  }
}

export async function readJudgeDockerCapacity() {
  const { code, output } = await dockerMetadata([
    'info',
    '--format',
    '{{json .}}',
  ]);
  if (code !== 0) throw new Error('Docker engine is unavailable for Judge.');
  const info = JSON.parse(output) as {
    CgroupDriver?: string;
    MemTotal?: number;
    NCPU?: number;
    Runtimes?: Record<string, unknown>;
    SecurityOptions?: string[];
  };
  if (!info.Runtimes?.runsc) {
    throw new Error('Judge requires the registered gVisor runsc runtime.');
  }
  if (
    !info.CgroupDriver ||
    info.CgroupDriver === 'none' ||
    info.SecurityOptions?.some((option) => option.includes('rootless'))
  ) {
    throw new Error('Judge requires enforced Docker cgroup resource limits.');
  }
  if (!info.NCPU || !info.MemTotal) {
    throw new Error('Docker did not report Judge host capacity.');
  }
  return { hostCpus: info.NCPU, hostMemoryBytes: info.MemTotal };
}

export function parseJudgeImages(raw = process.env.TUTURUUU_JUDGE_IMAGES) {
  const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  const images: JudgeImages = {};
  for (const [language, image] of Object.entries(parsed)) {
    if (
      !isJudgeLanguage(language) ||
      typeof image !== 'string' ||
      !IMAGE_REFERENCE.test(image)
    ) {
      throw new Error(`Invalid pinned Judge image for ${language}.`);
    }
    images[language] = image;
  }
  return images;
}

export async function getJudgeReadiness(rawImages?: string): Promise<{
  languages: JudgeLanguage[];
  ready: boolean;
  reason: string | null;
}> {
  try {
    const images = parseJudgeImages(rawImages);
    if (Object.keys(images).length === 0) {
      return {
        languages: [],
        ready: false,
        reason: 'Pinned Judge images are not configured.',
      };
    }
    await readJudgeDockerCapacity();
    const languages: JudgeLanguage[] = [];
    for (const [language, image] of Object.entries(images) as [
      JudgeLanguage,
      string,
    ][]) {
      const { code } = await dockerMetadata(['image', 'inspect', image]);
      if (code !== 0) continue;
      const binary = judgeLanguageBinary(language);
      const smokeName = `ttr-judge-smoke-${randomUUID()}`;
      const smoke = await dockerMetadata(
        [
          'run',
          '--rm',
          '--pull=never',
          '--runtime=runsc',
          `--name=${smokeName}`,
          '--network=none',
          '--read-only',
          '--cap-drop=ALL',
          '--security-opt=no-new-privileges',
          '--user=65534:65534',
          '--cpus=0.25',
          '--memory=128m',
          '--memory-swap=128m',
          '--pids-limit=64',
          image,
          'sh',
          '-c',
          `command -v ${binary} >/dev/null && command -v base64 >/dev/null`,
        ],
        15_000
      );
      await dockerMetadata(['rm', '--force', smokeName]);
      if (smoke.code === 0) languages.push(language);
    }
    return {
      languages,
      ready: languages.length > 0,
      reason: languages.length ? null : 'No pinned Judge image is cached.',
    };
  } catch (error) {
    return {
      languages: [],
      ready: false,
      reason: error instanceof Error ? error.message : 'Judge is unavailable.',
    };
  }
}

export function parseJudgePayload(encoded: string): JudgePayload {
  if (encoded.length > 48_000) throw new Error('Judge payload is too large.');
  const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  if (
    !isJudgeLanguage(parsed?.language) ||
    typeof parsed.source !== 'string' ||
    parsed.source.length > 16_000 ||
    parsed.source.includes('\0') ||
    !Array.isArray(parsed.cases) ||
    parsed.cases.length < 1 ||
    parsed.cases.length > 10 ||
    !parsed.cases.every(
      (entry: unknown) =>
        !!entry &&
        typeof entry === 'object' &&
        typeof (entry as JudgeCase).input === 'string' &&
        (entry as JudgeCase).input.length <= 4096 &&
        typeof (entry as JudgeCase).expected === 'string' &&
        (entry as JudgeCase).expected.length <= 4096 &&
        typeof (entry as JudgeCase).visible === 'boolean'
    )
  ) {
    throw new Error('Invalid Judge payload.');
  }
  return parsed as JudgePayload;
}

export function parseJudgeResourceLimits(raw: string): JudgeResourceLimits {
  const value = JSON.parse(raw) as Partial<JudgeResourceLimits>;
  const ranges: Record<keyof JudgeResourceLimits, [number, number]> = {
    max_cpu_percent: [10, 80],
    max_memory_percent: [10, 80],
    max_sandboxes: [1, 16],
    max_instances: [1, 8],
    sandbox_memory_mb: [128, 4096],
    sandbox_timeout_seconds: [1, 120],
    sandbox_pids: [16, 256],
  };
  for (const [key, [min, max]] of Object.entries(ranges) as [
    keyof JudgeResourceLimits,
    [number, number],
  ][]) {
    const number = value[key];
    if (!Number.isInteger(number) || number! < min || number! > max) {
      throw new Error(`Invalid Judge resource limit: ${key}`);
    }
  }
  return value as JudgeResourceLimits;
}

export function createJudgeDockerArgs({
  image,
  language = 'python',
  limits,
  name,
  source,
  hostCpus = cpus().length,
  hostMemoryBytes = totalmem(),
  freeMemoryBytes = freemem(),
}: {
  image: string;
  language?: JudgeLanguage;
  limits: JudgeResourceLimits;
  name: string;
  source: string;
  hostCpus?: number;
  hostMemoryBytes?: number;
  freeMemoryBytes?: number;
}) {
  if (!IMAGE_REFERENCE.test(image)) {
    throw new Error('Judge image must be pinned to a sha256 digest.');
  }
  const parallelLimit = Math.min(limits.max_sandboxes, limits.max_instances);
  const budgetMb = Math.floor(
    ((hostMemoryBytes / MEBIBYTE) * (limits.max_memory_percent / 100)) /
      parallelLimit
  );
  const availableMb = Math.floor(
    (freeMemoryBytes / MEBIBYTE - 256) / parallelLimit
  );
  const memoryMb = Math.min(limits.sandbox_memory_mb, budgetMb, availableMb);
  if (memoryMb < minimumJudgeMemoryMb(language)) {
    throw new Error('Judge host has insufficient free memory.');
  }
  const cpuQuota = Math.max(
    0.01,
    Math.floor(
      Math.min(1, (hostCpus * limits.max_cpu_percent) / 100 / parallelLimit) *
        1000
    ) / 1000
  );
  const tmpfsMb = Math.min(512, Math.max(64, Math.floor(memoryMb / 2)));

  return [
    'run',
    '--rm',
    '--interactive',
    '--pull=never',
    '--runtime=runsc',
    `--name=${name}`,
    '--network=none',
    '--read-only',
    '--cap-drop=ALL',
    '--security-opt=no-new-privileges',
    '--user=65534:65534',
    '--log-driver=none',
    `--tmpfs=/tmp:rw,nosuid,size=${tmpfsMb}m`,
    '--env=HOME=/tmp',
    '--env=TMPDIR=/tmp',
    '--workdir=/tmp',
    `--cpus=${cpuQuota.toFixed(3)}`,
    `--memory=${memoryMb}m`,
    `--memory-swap=${memoryMb}m`,
    `--pids-limit=${limits.sandbox_pids}`,
    image,
    ...createJudgeLanguageCommand({ language, memoryMb, source }),
  ];
}

async function runDocker(
  args: string[],
  input: string,
  timeoutSeconds: number
) {
  const startedAt = performance.now();
  const child = spawn('docker', args, { shell: false, stdio: 'pipe' });
  let output = '';
  let errorOutput = '';
  let exceededOutput = false;
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    child.kill('SIGKILL');
  }, timeoutSeconds * 1000);
  child.stdout.on('data', (chunk) => {
    output = (output + String(chunk)).slice(0, 16_385);
    if (output.length > 16_384) {
      exceededOutput = true;
      child.kill('SIGKILL');
    }
  });
  child.stderr.on('data', (chunk) => {
    errorOutput = (errorOutput + String(chunk)).slice(0, 16_385);
    if (errorOutput.length > 16_384) {
      exceededOutput = true;
      child.kill('SIGKILL');
    }
  });
  child.stdin.on('error', () => {
    // Docker can close stdin before an invalid or timed-out job finishes.
  });
  child.stdin.end(input);

  try {
    const code = await new Promise<number>((resolveExit, reject) => {
      child.on('error', reject);
      child.on('exit', (exitCode) => resolveExit(exitCode ?? 1));
    });
    return {
      code,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt)),
      errorOutput: errorOutput.slice(0, 4096),
      exceededOutput,
      output,
      timedOut,
    };
  } finally {
    clearTimeout(timer);
    const name = args.find((arg) => arg.startsWith('--name='))?.slice(7);
    if (name) {
      await dockerMetadata(['rm', '--force', name]);
    }
  }
}

export async function runJudgeCases({
  images,
  limits,
  payload,
}: {
  images: JudgeImages;
  limits: JudgeResourceLimits;
  payload: JudgePayload;
}) {
  const capacity = await readJudgeDockerCapacity();
  const image = images[payload.language];
  if (!image)
    throw new Error(`Judge language ${payload.language} is unavailable.`);
  const results = [];
  for (const [index, testCase] of payload.cases.entries()) {
    const name = `ttr-judge-${randomUUID()}`;
    const args = createJudgeDockerArgs({
      image,
      language: payload.language,
      limits,
      name,
      source: payload.source,
      ...capacity,
    });
    const run = await runDocker(
      args,
      testCase.input,
      limits.sandbox_timeout_seconds
    );
    const passed =
      run.code === 0 &&
      !run.timedOut &&
      !run.exceededOutput &&
      run.output.trimEnd() === testCase.expected.trimEnd();
    results.push({
      index,
      passed,
      visible: testCase.visible,
      durationMs: run.durationMs,
      ...(testCase.visible
        ? {
            output: run.output.slice(0, 4096),
            stderr: run.errorOutput,
          }
        : {}),
      reason: run.timedOut
        ? 'time_limit'
        : run.exceededOutput
          ? 'output_limit'
          : run.code === 100
            ? 'compile_error'
            : run.code !== 0
              ? 'runtime_error'
              : passed
                ? 'passed'
                : 'wrong_answer',
    });
  }
  return { passed: results.filter((result) => result.passed).length, results };
}
