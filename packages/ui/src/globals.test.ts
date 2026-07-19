import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = existsSync(resolve(process.cwd(), 'packages/ui/package.json'))
  ? process.cwd()
  : resolve(process.cwd(), '../..');

function readRepoFile(path: string) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(css|ts|tsx)$/u.test(entry.name) ? [path] : [];
  });
}

describe('shared mobile form ergonomics', () => {
  it('exports an iOS focus-zoom guard without disabling pinch zoom', () => {
    const packageJson = JSON.parse(
      readRepoFile('packages/ui/package.json')
    ) as {
      exports: Record<string, string>;
    };
    const styles = readRepoFile('packages/ui/src/globals.css');

    expect(packageJson.exports['./globals.css']).toBe('./src/globals.css');
    expect(styles).toContain('@supports (-webkit-touch-callout: none)');
    expect(styles).toContain('@media (pointer: coarse)');
    expect(styles).toContain('input:not([type="button"])');
    expect(styles).toContain('select[class],');
    expect(styles).toContain('textarea[class],');
    expect(styles).toContain('[contenteditable="true"][class]');
    expect(styles).toMatch(/font-size:\s*16px/u);
    expect(styles).not.toMatch(/user-scalable|maximum-scale/iu);
  });

  it('reaches every web app that consumes the shared UI package', () => {
    const appsDirectory = resolve(repoRoot, 'apps');
    const appNames = readdirSync(appsDirectory, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((appName) => {
        const manifestPath = resolve(appsDirectory, appName, 'package.json');
        if (!existsSync(manifestPath)) return false;

        const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as {
          dependencies?: Record<string, string>;
        };
        return Boolean(manifest.dependencies?.['@tuturuuu/ui']);
      });

    expect(appNames.length).toBeGreaterThan(0);

    for (const appName of appNames) {
      const appSources = sourceFiles(resolve(appsDirectory, appName, 'src'));
      const importsSharedStyles = appSources.some((path) => {
        const source = readFileSync(path, 'utf8');
        return (
          source.includes('@tuturuuu/ui/globals.css') ||
          source.includes('@tuturuuu/tasks-ui/globals.css')
        );
      });

      expect(importsSharedStyles, `${appName} must load shared UI styles`).toBe(
        true
      );
    }
  });
});
