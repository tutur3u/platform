import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { z } from 'zod';
import { artifactSchema } from './artifact';
import { bytesHash } from './cache';
import { downloadArtifact } from './download';

const bytes = Buffer.from('GGUFsynthetic-fixture');
const artifact = artifactSchema.parse({
  id: 'synthetic-test',
  repository: 'google/synthetic-fixture',
  revision: 'a'.repeat(40),
  filename: 'fixture.gguf',
  bytes: bytes.length,
  sha256: bytesHash(bytes),
  format: 'gguf',
  license: 'Apache-2.0',
  gated: false,
  evidence: ['https://example.org/synthetic'],
});

function partialPath(path: string) {
  const state = z
    .object({ partId: z.uuid() })
    .passthrough()
    .parse(JSON.parse(readFileSync(`${path}.transfer.json`, 'utf8')));
  return `${path}.partial-${state.partId}`;
}

it('ignores an unpublished empty initializer and resumes a bound zero-byte checkpoint after interruption', async () => {
  const { directory, path } = fixture();
  try {
    const orphan = `${path}.partial-00000000-0000-4000-8000-000000000009`;
    writeFileSync(orphan, '', { mode: 0o600 });
    await expect(
      downloadArtifact({
        path,
        artifact,
        fetcher: vi
          .fn<typeof fetch>()
          .mockRejectedValue(new Error('interrupted before response')),
      })
    ).rejects.toThrow('interrupted before response');
    expect(readFileSync(partialPath(path)).length).toBe(0);
    await expect(
      downloadArtifact({
        path,
        artifact,
        fetcher: vi.fn<typeof fetch>().mockResolvedValue(new Response(bytes)),
      })
    ).resolves.toMatchObject({ verified: true });
    expect(readFileSync(orphan).length).toBe(0);
    expect(readFileSync(path)).toEqual(bytes);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('refuses unknown partial ownership and detects checkpoint corruption before resuming', async () => {
  const { directory, path } = fixture();
  const fetcher = vi.fn<typeof fetch>();
  try {
    writeFileSync(`${path}.partial`, 'foreign private data', { mode: 0o600 });
    await expect(downloadArtifact({ path, artifact, fetcher })).rejects.toThrow(
      'without its verified transfer manifest'
    );
    expect(readFileSync(`${path}.partial`, 'utf8')).toBe(
      'foreign private data'
    );
    expect(fetcher).not.toHaveBeenCalled();
    const other = join(directory, 'other.gguf');
    await expect(
      downloadArtifact({
        path: other,
        artifact,
        fetcher: vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response(bytes.subarray(0, 7))),
      })
    ).rejects.toThrow('partial transfer retained');
    writeFileSync(partialPath(other), Buffer.from('tampered'));
    await expect(
      downloadArtifact({ path: other, artifact, fetcher })
    ).rejects.toThrow('checkpoint hash');
    expect(fetcher).not.toHaveBeenCalled();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
function fixture() {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'ttr-download-')));
  return { directory, path: join(directory, 'fixture.gguf') };
}

it('follows the exact documented CDN redirect with credentials omitted and verifies bytes', async () => {
  const { directory, path } = fixture();
  const target =
    'https://us.aws.cdn.hf.co/xet-bridge-us/synthetic?signature=fixture';
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { location: target } })
    )
    .mockResolvedValueOnce(new Response(bytes));
  try {
    await expect(
      downloadArtifact({ path, artifact, fetcher })
    ).resolves.toEqual({
      verified: true,
      bytes: bytes.length,
      sha256: artifact.sha256,
    });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[1]?.[0]).toBe(target);
    for (const [, options] of fetcher.mock.calls)
      expect(options).toMatchObject({
        credentials: 'omit',
        redirect: 'manual',
      });
    expect(readFileSync(path)).toEqual(bytes);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it.each([
  'https://us.aws.cdn.hf.co.attacker.example/model',
  'https://unknown.example/model',
  'http://us.aws.cdn.hf.co/model',
  'https://user:pass@us.aws.cdn.hf.co/model',
  'https://us.aws.cdn.hf.co:444/model',
])(
  'rejects unsafe CDN redirect authority before requesting target: %s',
  async (target) => {
    const { directory, path } = fixture();
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        new Response(null, { status: 302, headers: { location: target } })
      );
    try {
      await expect(
        downloadArtifact({ path, artifact, fetcher })
      ).rejects.toThrow('approved public artifact hosts');
      expect(fetcher).toHaveBeenCalledTimes(1);
      expect(readFileSync(partialPath(path)).length).toBe(0);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
);

it('resumes a retained partial file and promotes only a size/hash/format verified artifact', async () => {
  const { directory, path } = fixture();
  const first = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(bytes.subarray(0, 7)));
  const second = vi.fn<typeof fetch>().mockResolvedValue(
    new Response(bytes.subarray(7), {
      status: 206,
      headers: {
        'content-range': `bytes 7-${bytes.length - 1}/${bytes.length}`,
      },
    })
  );
  try {
    await expect(
      downloadArtifact({ path, artifact, fetcher: first })
    ).rejects.toThrow('partial transfer retained');
    expect(readFileSync(partialPath(path))).toEqual(bytes.subarray(0, 7));
    await expect(
      downloadArtifact({ path, artifact, fetcher: second })
    ).resolves.toEqual({
      verified: true,
      bytes: bytes.length,
      sha256: artifact.sha256,
    });
    expect(second.mock.calls[0]?.[1]?.headers).toEqual({ Range: 'bytes=7-' });
    expect(readFileSync(path)).toEqual(bytes);
    const noNetwork = vi.fn<typeof fetch>();
    await downloadArtifact({ path, artifact, fetcher: noNetwork });
    expect(noNetwork).not.toHaveBeenCalled();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('rejects checksum mismatch and stops further automatic retry', async () => {
  const { directory, path } = fixture();
  const fetcher = vi
    .fn<typeof fetch>()
    .mockResolvedValue(new Response(Buffer.from('XXXXsynthetic-fixture')));
  try {
    await expect(downloadArtifact({ path, artifact, fetcher })).rejects.toThrow(
      'checksum'
    );
    await expect(downloadArtifact({ path, artifact, fetcher })).rejects.toThrow(
      'retry budget'
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('rejects wrong resume ranges without writing response bytes', async () => {
  const { directory, path } = fixture();
  try {
    await expect(
      downloadArtifact({
        path,
        artifact,
        fetcher: vi
          .fn<typeof fetch>()
          .mockResolvedValue(new Response(bytes.subarray(0, 7))),
      })
    ).rejects.toThrow('partial transfer retained');
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(bytes.subarray(7), {
        status: 206,
        headers: {
          'content-range': `bytes 0-${bytes.length - 1}/${bytes.length}`,
        },
      })
    );
    await expect(downloadArtifact({ path, artifact, fetcher })).rejects.toThrow(
      'range'
    );
    expect(readFileSync(partialPath(path))).toEqual(bytes.subarray(0, 7));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('bounds oversized streams and refuses redirect authority changes', async () => {
  const { directory, path } = fixture();
  try {
    const redirect = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'https://unapproved.example/model' },
      })
    );
    await expect(
      downloadArtifact({ path, artifact, fetcher: redirect })
    ).rejects.toThrow('approved public artifact hosts');
    const oversized = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(Buffer.alloc(bytes.length + 1)));
    await expect(
      downloadArtifact({ path, artifact, fetcher: oversized })
    ).rejects.toThrow('byte budget');
    expect(readFileSync(partialPath(path)).length).toBe(0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
