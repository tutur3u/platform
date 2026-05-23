import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function getWebRoot() {
  return existsSync(resolve(process.cwd(), 'src/app'))
    ? process.cwd()
    : resolve(process.cwd(), 'apps/web');
}

describe('web Hive route layout editor styles', () => {
  it('loads React Flow styles only inside the Hive route segment', () => {
    const webRoot = getWebRoot();
    const source = readFileSync(
      resolve(webRoot, 'src/app/[locale]/(dashboard)/[wsId]/hive/layout.tsx'),
      {
        encoding: 'utf8',
      }
    );
    const rootLayout = readFileSync(
      resolve(webRoot, 'src/app/[locale]/layout.tsx'),
      {
        encoding: 'utf8',
      }
    );

    expect(source).toContain("import '@xyflow/react/dist/style.css';");
    expect(rootLayout).not.toContain("import '@xyflow/react/dist/style.css';");
  });
});
