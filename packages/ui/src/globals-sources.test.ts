import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import tailwind from '@tailwindcss/postcss';
import postcss from 'postcss';
import { afterAll, describe, expect, it } from 'vitest';

const globalsPath = resolve(__dirname, 'globals.css');
const launcherChromePath = resolve(
  __dirname,
  '../../satellite/src/components/command-launcher/command-launcher-chrome.tsx'
);

// Classes that bound the global command launcher dialog to the viewport. They
// are arbitrary values used only inside packages/satellite, so they are emitted
// only when globals.css registers that directory as a Tailwind source.
const LAUNCHER_VIEWPORT_CLASSES = [
  'top-[max(12px,9vh)]',
  'h-[min(560px,calc(100dvh_-_max(12px,9vh)_-_12px))]',
  'max-h-[calc(100dvh_-_max(12px,9vh)_-_12px)]',
  'w-[min(680px,calc(100vw_-_1.5rem))]',
  'max-sm:max-h-[calc(100dvh_-_1rem)]',
];

function toSelector(candidate: string) {
  return `.${candidate.replace(/[[\]():,.%/]/g, (char) => `\\${char}`)}`;
}

describe('shared globals.css Tailwind sources', () => {
  // An empty scan base mimics a consumer app (for example apps/web) whose
  // automatic content detection never reaches packages/satellite.
  const emptyBase = mkdtempSync(join(tmpdir(), 'ui-globals-sources-'));

  afterAll(() => {
    rmSync(emptyBase, { force: true, recursive: true });
  });

  it('keeps the command launcher sizing classes in the launcher chrome', () => {
    const chrome = readFileSync(launcherChromePath, 'utf8');
    for (const candidate of LAUNCHER_VIEWPORT_CLASSES) {
      expect(chrome).toContain(candidate);
    }
  });

  it('emits the command launcher viewport bounds for every consumer app', async () => {
    const result = await postcss([tailwind({ base: emptyBase })]).process(
      readFileSync(globalsPath, 'utf8'),
      { from: globalsPath }
    );

    const missing = LAUNCHER_VIEWPORT_CLASSES.filter(
      (candidate) => !result.css.includes(toSelector(candidate))
    );
    expect(missing).toEqual([]);
    expect(result.css).toMatch(
      /max-height:\s*calc\(100dvh - max\(12px,\s*9vh\) - 12px\)/
    );
    // The no-match note hides itself while other result rows exist; the rule
    // lives only in packages/satellite and needs the same @source entry.
    expect(result.css).toContain(
      ':has([cmdk-item]:not([data-command-fallback]))'
    );
  });
});
