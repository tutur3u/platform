import { access, readFile, realpath, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, resolve } from 'node:path';
import { z } from 'zod';

const clipSchema = z
  .object({
    audio: z.string().min(1),
    reference: z.string().min(1),
    mediaType: z.enum([
      'audio/wav',
      'audio/mpeg',
      'audio/mp4',
      'audio/webm',
      'audio/ogg',
    ]),
    language: z.enum(['auto', 'vi', 'en', 'vi+en']).default('auto'),
  })
  .strict();
export const manifestSchema = z
  .object({
    version: z.literal(1),
    consented: z.literal(true),
    glossary: z.array(z.string().min(1).max(100)).max(50).default([]),
    clips: z.array(clipSchema).min(1).max(40),
  })
  .strict();

export async function externalPath(path: string): Promise<string> {
  const canonical = await realpath(path);
  let directory = (await stat(canonical)).isDirectory()
    ? canonical
    : dirname(canonical);
  while (true) {
    try {
      await access(join(directory, '.git'));
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !('code' in error) ||
        error.code !== 'ENOENT'
      )
        throw new Error('path');
      const parent = dirname(directory);
      if (parent === directory) return canonical;
      directory = parent;
      continue;
    }
    throw new Error('private data must be outside git');
  }
}

async function boundedRead(path: string, bytes: number): Promise<Buffer> {
  const safe = await externalPath(path);
  const info = await stat(safe);
  if (!info.isFile() || info.size > bytes) throw new Error('input size');
  const data = await readFile(safe);
  if (data.length > bytes) throw new Error('input size');
  return data;
}

export async function loadDataset(manifestPath: string) {
  if (!isAbsolute(manifestPath)) throw new Error('manifest path');
  const manifestFile = await externalPath(manifestPath);
  const manifest = manifestSchema.parse(
    JSON.parse((await boundedRead(manifestFile, 100_000)).toString('utf8'))
  );
  if (manifest.glossary.join(' ').length > 1500)
    throw new Error('glossary size');
  const clips = [];
  for (const clip of manifest.clips) {
    const audioPath = resolve(dirname(manifestFile), clip.audio);
    const referencePath = resolve(dirname(manifestFile), clip.reference);
    const audio = await boundedRead(audioPath, 12_000_000);
    if (!audio.length) throw new Error('empty audio');
    const reference = (await boundedRead(referencePath, 40_000)).toString(
      'utf8'
    );
    if (Array.from(reference).length > 10_000)
      throw new Error('reference size');
    clips.push({
      audio,
      reference,
      mediaType: clip.mediaType,
      language: clip.language,
    });
  }
  return { glossary: manifest.glossary, clips };
}

export async function reportDirectory(path: string): Promise<string> {
  if (!isAbsolute(path) || parse(path).root === path)
    throw new Error('report directory');
  const directory = await externalPath(path);
  if (!(await stat(directory)).isDirectory())
    throw new Error('report directory');
  return directory;
}
