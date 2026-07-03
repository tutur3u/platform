import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const hiveDbSource = readFileSync(
  join(process.cwd(), 'src/lib/hive/hive-db.ts'),
  {
    encoding: 'utf8',
  }
);
const hiveCrdtSource = readFileSync(
  join(process.cwd(), 'src/lib/hive/crdt.ts'),
  {
    encoding: 'utf8',
  }
);

function staticImportPattern(modulePath: string) {
  const escapedModulePath = modulePath.replace(
    /[.*+?^${}()|[\]\\]/gu,
    String.raw`\$&`
  );

  return new RegExp(
    String.raw`^\s*import\s+(?!type\b)[\s\S]*?\sfrom\s+['"]${escapedModulePath}['"];`,
    'mu'
  );
}

describe('Hive server helper compile graph', () => {
  it('keeps Yjs CRDT helpers behind runtime split points', () => {
    for (const source of [hiveDbSource, hiveCrdtSource]) {
      expect(source).not.toMatch(
        staticImportPattern('@tuturuuu/realtime/hive/yjs')
      );
      expect(source).toMatch(
        /import\(\s*['"]@tuturuuu\/realtime\/hive\/yjs['"]\s*\)/u
      );
    }
  });
});
