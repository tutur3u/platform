import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PUBLIC_ASSETS } from './public-assets';

const root = join(__dirname, '../../public');
const walk = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? walk(join(directory, entry.name))
      : [`/${relative(root, join(directory, entry.name)).split(sep).join('/')}`]
  );

describe('native public assets', () => {
  it('lists exactly the files in public/', () => {
    expect([...PUBLIC_ASSETS].sort()).toEqual(walk(root).sort());
  });
});
