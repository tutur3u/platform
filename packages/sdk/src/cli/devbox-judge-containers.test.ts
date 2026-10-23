import { beforeEach, describe, expect, it, vi } from 'vitest';

const { dockerMetadata } = vi.hoisted(() => ({ dockerMetadata: vi.fn() }));
vi.mock('./devbox-docker-metadata', () => ({ dockerMetadata }));

import {
  JUDGE_CONTAINER_LABEL,
  JUDGE_OWNER_LABEL,
  judgeContainerLabelArgs,
  judgeContainerOwner,
  prepareJudgeContainers,
  removeOrphanedJudgeContainers,
} from './devbox-judge-containers';
import { createJudgeDockerArgs } from './devbox-judge-sandbox';

const ok = (output = '') => ({ code: 0, output });
const id = (char: string) => char.repeat(64);

describe('Judge container ownership', () => {
  beforeEach(() => {
    dockerMetadata.mockReset();
  });

  it('derives a stable owner that does not reveal the token', () => {
    const owner = judgeContainerOwner('tdbx_secret');
    expect(owner).toBe(judgeContainerOwner('tdbx_secret'));
    expect(owner).not.toBe(judgeContainerOwner('tdbx_other'));
    expect(owner).toMatch(/^[a-f0-9]{24}$/);
    expect(owner).not.toContain('secret');
  });

  it('labels every Judge sandbox with its owner', () => {
    const args = createJudgeDockerArgs({
      freeMemoryBytes: 8 * 1024 ** 3,
      hostCpus: 4,
      hostMemoryBytes: 16 * 1024 ** 3,
      image: `python@sha256:${'a'.repeat(64)}`,
      limits: {
        max_cpu_percent: 50,
        max_memory_percent: 25,
        max_instances: 1,
        max_sandboxes: 1,
        sandbox_memory_mb: 256,
        sandbox_pids: 64,
        sandbox_timeout_seconds: 10,
      },
      name: 'ttr-judge-fixture',
      source: 'print(1)',
    });
    for (const label of judgeContainerLabelArgs())
      expect(args).toContain(label);
  });

  it('removes only this owner’s labelled leftovers, in one bounded call', async () => {
    dockerMetadata
      .mockResolvedValueOnce(ok(`${id('a')}\n${id('b')}\n${id('a')}\nbogus\n`))
      .mockResolvedValueOnce(ok());

    await expect(removeOrphanedJudgeContainers('owner-1')).resolves.toBe(2);

    expect(dockerMetadata).toHaveBeenNthCalledWith(
      1,
      expect.arrayContaining([
        `label=${JUDGE_CONTAINER_LABEL}=1`,
        `label=${JUDGE_OWNER_LABEL}=owner-1`,
      ]),
      10_000,
      undefined
    );
    expect(dockerMetadata).toHaveBeenNthCalledWith(
      2,
      ['rm', '--force', id('a'), id('b')],
      30_000,
      undefined
    );
  });

  it('caps a single cleanup at 100 containers', async () => {
    const ids = Array.from({ length: 150 }, (_, index) =>
      index.toString(16).padStart(64, '0')
    );
    dockerMetadata
      .mockResolvedValueOnce(ok(ids.join('\n')))
      .mockResolvedValueOnce(ok());

    await expect(removeOrphanedJudgeContainers('owner-1')).resolves.toBe(100);
    expect(dockerMetadata.mock.calls[1]?.[0]).toHaveLength(102);
  });

  it('does nothing when Docker is unavailable or nothing is left', async () => {
    dockerMetadata.mockResolvedValueOnce({ code: 1, output: '' });
    await expect(removeOrphanedJudgeContainers('owner-1')).resolves.toBe(0);
    dockerMetadata.mockResolvedValueOnce(ok('\n'));
    await expect(removeOrphanedJudgeContainers('owner-1')).resolves.toBe(0);
    expect(dockerMetadata).toHaveBeenCalledTimes(2);
  });

  it('skips cleanup for playground pools and hosts without Judge images', async () => {
    await expect(
      prepareJudgeContainers('tdbx_token', {
        TUTURUUU_JUDGE_IMAGES: '{"python":"x"}',
        TUTURUUU_PLAYGROUND_POOL_ID: 'pool',
      })
    ).resolves.toBe(0);
    await expect(prepareJudgeContainers('tdbx_token', {})).resolves.toBe(0);
    expect(dockerMetadata).not.toHaveBeenCalled();
    expect(judgeContainerLabelArgs()).toContain(
      `--label=${JUDGE_OWNER_LABEL}=${judgeContainerOwner('tdbx_token')}`
    );
  });

  it('cleans up the runner’s containers on a Judge host', async () => {
    dockerMetadata
      .mockResolvedValueOnce(ok(id('c')))
      .mockResolvedValueOnce(ok());
    vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(
      prepareJudgeContainers('tdbx_token', {
        TUTURUUU_JUDGE_IMAGES: '{"python":"x"}',
      })
    ).resolves.toBe(1);
    expect(dockerMetadata.mock.calls[0]?.[0]).toContain(
      `label=${JUDGE_OWNER_LABEL}=${judgeContainerOwner('tdbx_token')}`
    );
  });
});
