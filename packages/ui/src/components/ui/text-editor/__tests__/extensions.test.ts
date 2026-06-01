import type SupabaseProvider from '@tuturuuu/ui/hooks/supabase-provider';
import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { getEditorExtensions } from '../extensions';
import { Mention } from '../mention-extension';

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

  it('round-trips task mention workspace metadata through HTML attrs', () => {
    const renderOutput = (Mention.config as any).renderHTML({
      HTMLAttributes: {
        entityId: 'task-1',
        entityType: 'task',
        displayName: '42',
        subtitle: 'Cross workspace task',
        workspaceId: 'source-ws',
      },
    }) as any[];

    expect(renderOutput[1]).toHaveProperty('data-workspace-id', 'source-ws');

    const parseRules = (Mention.config as any).parseHTML() as any[];
    const element = document.createElement('span');
    element.dataset.mention = 'true';
    element.dataset.entityId = 'task-1';
    element.dataset.entityType = 'task';
    element.dataset.displayNumber = '42';
    element.dataset.subtitle = 'Cross workspace task';
    element.dataset.workspaceId = 'source-ws';

    expect(parseRules[0]?.getAttrs(element)).toEqual(
      expect.objectContaining({
        entityId: 'task-1',
        entityType: 'task',
        displayName: '42',
        subtitle: 'Cross workspace task',
        workspaceId: 'source-ws',
      })
    );
  });
});
