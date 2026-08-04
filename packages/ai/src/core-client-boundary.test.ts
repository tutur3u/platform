import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const coreSource = readFileSync(join(process.cwd(), 'src/core.ts'), 'utf8');

describe('@tuturuuu/ai/core client boundary', () => {
  it('does not re-export the server-only Chat SDK', () => {
    expect(coreSource).not.toMatch(
      /^export[^\n]*from\s+['"]chat(?:\/ai)?['"];?$/gmu
    );
  });
});
