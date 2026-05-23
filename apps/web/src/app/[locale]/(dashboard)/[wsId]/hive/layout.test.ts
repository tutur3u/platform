import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('web Hive route layout editor styles', () => {
  it('loads React Flow styles only inside the Hive route segment', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/app/[locale]/(dashboard)/[wsId]/hive/layout.tsx'
      ),
      'utf8'
    );
    const rootLayout = readFileSync(
      resolve(process.cwd(), 'src/app/[locale]/layout.tsx'),
      'utf8'
    );

    expect(source).toContain("import '@xyflow/react/dist/style.css';");
    expect(rootLayout).not.toContain("import '@xyflow/react/dist/style.css';");
  });
});
