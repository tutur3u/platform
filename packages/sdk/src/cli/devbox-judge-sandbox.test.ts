import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createJudgeDockerArgs,
  getJudgeReadiness,
  parseJudgeImages,
  parseJudgePayload,
  parseJudgeResourceLimits,
  runJudgeCases,
} from './devbox-judge-sandbox';

const limits = {
  max_cpu_percent: 50,
  max_memory_percent: 25,
  max_sandboxes: 1,
  max_instances: 1,
  sandbox_memory_mb: 256,
  sandbox_timeout_seconds: 10,
  sandbox_pids: 64,
};
const image = `python@sha256:${'a'.repeat(64)}`;

describe('Judge sandbox', () => {
  afterEach(() => vi.unstubAllEnvs());
  it('disables Judge readiness and execution in a dedicated Playground process before Docker', async () => {
    vi.stubEnv('TUTURUUU_PLAYGROUND_POOL_ID', 'fixture');
    expect(await getJudgeReadiness(JSON.stringify({ python: image }))).toEqual({
      ready: false,
      languages: [],
      reason: 'This process owns a dedicated Playground pool.',
    });
    await expect(
      runJudgeCases({
        images: { python: image },
        limits,
        payload: {
          language: 'python',
          source: '',
          cases: [{ input: '', expected: '', visible: true }],
        },
      })
    ).rejects.toThrow('disabled in a dedicated Playground process');
  });
  it('caps the sandbox below host budgets with no network or mounts', () => {
    const args = createJudgeDockerArgs({
      image,
      limits,
      name: 'ttr-judge-test',
      source: 'print(input())',
      hostCpus: 2,
      hostMemoryBytes: 4096 * 1024 * 1024,
      freeMemoryBytes: 2048 * 1024 * 1024,
    });
    expect(args).toContain('--runtime=runsc');
    expect(args).toContain('--network=none');
    expect(args).toContain('--read-only');
    expect(args).toContain('--cap-drop=ALL');
    expect(args).toContain('--cpus=1.000');
    expect(args).toContain('--memory=256m');
    expect(args).toContain('--memory-swap=256m');
    expect(args).toContain('--pids-limit=64');
    expect(args.some((arg) => arg.startsWith('--volume'))).toBe(false);
  });

  it('splits host budgets across configured concurrent sandboxes', () => {
    const args = createJudgeDockerArgs({
      image,
      limits: {
        ...limits,
        max_instances: 2,
        max_sandboxes: 2,
        sandbox_memory_mb: 1024,
      },
      name: 'ttr-judge-parallel-test',
      source: 'print(1)',
      hostCpus: 2,
      hostMemoryBytes: 4096 * 1024 * 1024,
      freeMemoryBytes: 2048 * 1024 * 1024,
    });
    expect(args).toContain('--cpus=0.500');
    expect(args).toContain('--memory=512m');
  });

  it('rejects insufficient host memory and mutable images', () => {
    expect(() =>
      createJudgeDockerArgs({
        image,
        limits,
        name: 'test',
        source: '',
        hostMemoryBytes: 256 * 1024 * 1024,
        freeMemoryBytes: 256 * 1024 * 1024,
      })
    ).toThrow('insufficient free memory');
    expect(() =>
      createJudgeDockerArgs({
        image: 'python:latest',
        limits,
        name: 'test',
        source: '',
      })
    ).toThrow('pinned');
  });

  it('validates payload and resource bounds before execution', () => {
    const payload = {
      cases: [{ expected: '2', input: '1\n', visible: true }],
      language: 'python',
      source: 'print(int(input()) + 1)',
    };
    expect(
      parseJudgePayload(
        Buffer.from(JSON.stringify(payload)).toString('base64url')
      )
    ).toEqual(payload);
    expect(parseJudgeResourceLimits(JSON.stringify(limits))).toEqual(limits);
    expect(() =>
      parseJudgeResourceLimits(
        JSON.stringify({ ...limits, max_cpu_percent: 100 })
      )
    ).toThrow('max_cpu_percent');
  });

  it('builds compiled and interpreted language commands without shell interpolation', () => {
    const source = 'int main() { return 0; }';
    const cpp = createJudgeDockerArgs({
      image,
      language: 'cpp',
      limits,
      name: 'cpp-test',
      source,
      hostCpus: 4,
      hostMemoryBytes: 8 * 1024 ** 3,
      freeMemoryBytes: 4 * 1024 ** 3,
    });
    expect(cpp).toContain('sh');
    expect(cpp.join(' ')).toContain('g++ -O2 -std=c++20');
    expect(cpp).not.toContain(source);

    const javascript = createJudgeDockerArgs({
      image,
      language: 'javascript',
      limits,
      name: 'js-test',
      source: 'console.log(1)',
      hostCpus: 4,
      hostMemoryBytes: 8 * 1024 ** 3,
      freeMemoryBytes: 4 * 1024 ** 3,
    });
    expect(javascript.slice(-3)).toEqual(['node', '-e', 'console.log(1)']);
  });

  it('accepts only pinned images for supported languages', () => {
    expect(
      parseJudgeImages(JSON.stringify({ cpp: image, python: image }))
    ).toEqual({
      cpp: image,
      python: image,
    });
    expect(() =>
      parseJudgeImages(JSON.stringify({ cpp: 'gcc:latest' }))
    ).toThrow();
    expect(() =>
      parseJudgeImages(JSON.stringify({ unknown: image }))
    ).toThrow();
  });
});
