import {
  mkdtemp,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { main } from './cli';
import * as providers from './providers';

const temporary: string[] = [];
const warnings = globalThis.AI_SDK_LOG_WARNINGS;
afterEach(async () => {
  vi.restoreAllMocks();
  globalThis.AI_SDK_LOG_WARNINGS = warnings;
  for (const path of temporary.splice(0))
    await rm(path, { recursive: true, force: true });
});
describe('private report CLI', () => {
  it('writes JSON and Markdown with private permissions and no transcript content', async () => {
    const root = await mkdtemp(join(tmpdir(), 'meet-eval-cli-'));
    temporary.push(root);
    await writeFile(join(root, 'audio.wav'), new Uint8Array([0]));
    await writeFile(
      join(root, 'reference.txt'),
      'Synthetic confidential phrase'
    );
    await writeFile(
      join(root, 'manifest.json'),
      JSON.stringify({
        version: 1,
        consented: true,
        glossary: ['confidential'],
        clips: [
          {
            audio: 'audio.wav',
            reference: 'reference.txt',
            mediaType: 'audio/wav',
          },
        ],
      })
    );
    vi.spyOn(providers, 'createEvalProviders').mockReturnValue([
      {
        id: 'gemini-flash-lite',
        model: 'fixture',
        transcribeBatch: async () => ['Synthetic confidential phrase'],
      },
    ]);
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(
      await main({
        MEET_STT_EVAL_MANIFEST: join(root, 'manifest.json'),
        MEET_STT_EVAL_REPORT_DIR: root,
      })
    ).toBe(0);
    const files = (await readdir(root)).filter((name) =>
      name.startsWith('meet-stt-')
    );
    expect(files).toHaveLength(2);
    for (const name of files) {
      const output = await readFile(join(root, name), 'utf8');
      expect(output).not.toContain('confidential');
      expect((await stat(join(root, name))).mode & 0o777).toBe(0o600);
    }
    const json = files.find((name) => name.endsWith('.json'));
    expect(json).toBeDefined();
    if (json)
      expect(
        JSON.parse(await readFile(join(root, json), 'utf8')).results[0].scores
          .wer
      ).toBe(0);
    expect(log.mock.calls.flat().join('')).not.toContain('confidential');
  });
  it('suppresses raw input errors and never calls providers on invalid configuration', async () => {
    const create = vi.spyOn(providers, 'createEvalProviders');
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(
      await main({
        MEET_STT_EVAL_MANIFEST: 'secret-path',
        MEET_STT_EVAL_REPORT_DIR: 'secret-output',
      })
    ).toBe(1);
    expect(create).not.toHaveBeenCalled();
    expect(error.mock.calls.flat().join('')).not.toContain('secret');
  });
});
