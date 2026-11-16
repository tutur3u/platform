import { describe, expect, it } from 'vitest';
import { staticImportModules } from './static-import-modules';

const moduleName = '@marsidev/react-turnstile';
describe('static import boundaries', () => {
  it('keeps a preceding value import separate from a type-only import', () => {
    expect(
      staticImportModules(
        `import { helper } from './helper';\nimport type { TurnstileInstance } from '${moduleName}';`
      )
    ).toEqual(['./helper']);
  });
  it.each([
    `import { Turnstile } from '${moduleName}';`,
    `import '${moduleName}';`,
    `import { type TurnstileInstance, Turnstile } from '${moduleName}';`,
  ])('detects runtime imports: %s', (source) => {
    expect(staticImportModules(source)).toContain(moduleName);
  });
  it('allows dynamic imports and inline type-only bindings', () => {
    expect(
      staticImportModules(
        `const widget = import('${moduleName}');\nimport { type TurnstileInstance } from '${moduleName}';`
      )
    ).toEqual([]);
  });
});
