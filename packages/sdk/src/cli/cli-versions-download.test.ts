import { createHash } from 'node:crypto';
import {
  lstat,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadVerifiedArchive } from './cli-versions-download';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(
    dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
  );
});
async function temporary() {
  const root = await mkdtemp(join(tmpdir(), 'cli-download-'));
  dirs.push(root);
  return { root, path: join(root, 'release.tgz') };
}
const integrity = (bytes: string) =>
  `sha512-${createHash('sha512').update(bytes).digest('base64')}`;

describe('bounded verified CLI downloads', () => {
  it('streams to an exclusive 0600 file inside the private directory', async () => {
    const { root, path } = await temporary();
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(Buffer.from('veri'));
          controller.enqueue(Buffer.from('fied'));
          controller.close();
        },
      })
    );
    const wholeBody = vi.spyOn(response, 'arrayBuffer');
    expect(
      await downloadVerifiedArchive(response, path, integrity('verified'), {
        maxBytes: 8,
      })
    ).toEqual(Buffer.from('verified'));
    expect(wholeBody).not.toHaveBeenCalled();
    expect(await readFile(path, 'utf8')).toBe('verified');
    expect((await lstat(root)).mode & 0o777).toBe(0o700);
    expect((await lstat(path)).mode & 0o777).toBe(0o600);
    expect(response.body?.locked).toBe(false);
  });

  it('rejects an oversized Content-Length before creating the file', async () => {
    const { path } = await temporary();
    const response = new Response('body', {
      headers: { 'content-length': '9' },
    });
    await expect(
      downloadVerifiedArchive(response, path, integrity('body'), {
        maxBytes: 8,
      })
    ).rejects.toThrow(/size limit/u);
    await expect(lstat(path)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('enforces the streamed byte cap without writing the over-limit chunk', async () => {
    const { path } = await temporary();
    let pulls = 0;
    let cancelled = false;
    const response = new Response(
      new ReadableStream(
        {
          pull(controller) {
            controller.enqueue(Buffer.from(pulls++ === 0 ? 'abcd' : 'ef'));
          },
          cancel() {
            cancelled = true;
          },
        },
        { highWaterMark: 0 }
      )
    );
    await expect(
      downloadVerifiedArchive(response, path, integrity('abcdef'), {
        maxBytes: 5,
      })
    ).rejects.toThrow(/size limit/u);
    expect(await readFile(path, 'utf8')).toBe('abcd');
    expect(cancelled).toBe(true);
    expect(response.body?.locked).toBe(false);
  });

  it('does not return bytes until registry integrity matches', async () => {
    const { path } = await temporary();
    const response = new Response('tampered');
    await expect(
      downloadVerifiedArchive(response, path, integrity('original'))
    ).rejects.toThrow(/registry integrity check/u);
    expect(response.body?.locked).toBe(false);
  });

  it.each(['file', 'symlink'])(
    'refuses an existing %s without modifying its contents',
    async (kind) => {
      const { root, path } = await temporary();
      const target = join(root, 'existing');
      await writeFile(target, 'sentinel');
      if (kind === 'symlink') await symlink(target, path);
      else await writeFile(path, 'sentinel');
      await expect(
        downloadVerifiedArchive(
          new Response('verified'),
          path,
          integrity('verified')
        )
      ).rejects.toMatchObject({ code: 'EEXIST' });
      expect(await readFile(path, 'utf8')).toBe('sentinel');
      expect(await readFile(target, 'utf8')).toBe('sentinel');
    }
  );
});
