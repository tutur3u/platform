import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('web Mind board route layout editor styles', () => {
  it('loads React Flow styles only inside the Mind board route segment', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/app/[locale]/(dashboard)/[wsId]/mind/boards/[boardId]/layout.tsx'
      ),
      'utf8'
    );
    const indexPage = readFileSync(
      resolve(
        process.cwd(),
        'src/app/[locale]/(dashboard)/[wsId]/mind/page.tsx'
      ),
      'utf8'
    );
    const rootLayout = readFileSync(
      resolve(process.cwd(), 'src/app/[locale]/layout.tsx'),
      'utf8'
    );

    expect(source).toContain("import '@xyflow/react/dist/style.css';");
    expect(indexPage).not.toContain("import '@xyflow/react/dist/style.css';");
    expect(rootLayout).not.toContain("import '@xyflow/react/dist/style.css';");
  });
});
