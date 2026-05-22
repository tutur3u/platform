import type SupabaseProvider from '@tuturuuu/ui/hooks/supabase-provider';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { getEditorExtensions } from '../extensions';

function extensionNames(options: Parameters<typeof getEditorExtensions>[0]) {
  return getEditorExtensions(options).map((extension) => extension.name);
}

describe('text editor extensions', () => {
  it('keeps Yjs document sync available without anonymous collaboration carets', () => {
    const names = extensionNames({
      doc: new Y.Doc(),
      provider: {} as SupabaseProvider,
    });

    expect(names).toContain('collaboration');
    expect(names).not.toContain('collaborationCaret');
  });

  it('enables collaboration carets only when a named user is available', () => {
    const names = extensionNames({
      doc: new Y.Doc(),
      provider: {} as SupabaseProvider,
      collaborationUser: {
        id: 'user-1',
        name: 'User One',
        color: '#3b82f6',
      },
    });

    expect(names).toContain('collaboration');
    expect(names).toContain('collaborationCaret');
  });
});
