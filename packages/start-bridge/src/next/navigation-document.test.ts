import { describe, expect, it } from 'vitest';
import * as documentNavigation from './navigation-document';
import * as routedNavigation from './navigation';

// Shared client components import `next/navigation` hooks without knowing
// which shim an app resolves; a hook missing from the document shim fails
// the native build of every `navigation: 'document'` app with MISSING_EXPORT.
describe('document navigation shim', () => {
  it('exports every client hook of the routed shim', () => {
    const hooks = Object.keys(routedNavigation).filter((name) =>
      name.startsWith('use')
    );
    expect(hooks).toContain('useParams');
    for (const hook of hooks) {
      expect(
        typeof documentNavigation[hook as keyof typeof documentNavigation],
        hook
      ).toBe('function');
    }
  });
});
