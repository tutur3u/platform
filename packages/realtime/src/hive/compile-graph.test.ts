import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const hiveIndexSource = readFileSync(join(process.cwd(), 'src/hive/index.ts'), {
  encoding: 'utf8',
});

describe('@tuturuuu/realtime Hive compile graph', () => {
  it('keeps the default Hive entrypoint free of Yjs module evaluation', () => {
    expect(hiveIndexSource).not.toMatch(/from ['"]yjs['"]/u);
    expect(hiveIndexSource).not.toMatch(/export\s+.*from ['"]\.\/yjs['"]/u);
  });
});
