import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const descriptionRouteDir = join(
  process.cwd(),
  'src/server/tasks/taskId/description'
);
const schemaSource = readFileSync(join(descriptionRouteDir, 'schema.ts'), {
  encoding: 'utf8',
});
const routeSource = readFileSync(join(descriptionRouteDir, 'route.ts'), {
  encoding: 'utf8',
});

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

describe('task description route compile graph', () => {
  it('keeps Yjs conversion out of route and schema module evaluation', () => {
    for (const source of [schemaSource, routeSource]) {
      expect(source).not.toMatch(
        staticImportPattern('@tuturuuu/utils/yjs-task-description')
      );
      expect(source).not.toMatch(
        staticImportPattern('@tuturuuu/utils/yjs-helper')
      );
    }
  });

  it('loads Yjs validation and derivation only from async split points', () => {
    expect(routeSource).toMatch(
      /import\(\s*['"]@tuturuuu\/utils\/yjs-task-description['"]\s*\)/u
    );
  });
});
