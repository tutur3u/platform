import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readWorkspaceAccessSource(fileName: string) {
  const sourcePath = [
    join(
      process.cwd(),
      'packages/ui/src/components/ui/custom/workspace-access',
      fileName
    ),
    join(process.cwd(), 'src/components/ui/custom/workspace-access', fileName),
  ].find((candidate) => existsSync(candidate));

  if (!sourcePath) {
    throw new Error(`Unable to locate ${fileName}`);
  }

  return readFileSync(sourcePath, 'utf8');
}

describe('workspace access responsive layout', () => {
  it.each([
    'workspace-access-invite-dialog.tsx',
    'workspace-access-role-editor-dialog.tsx',
  ])('keeps %s within the mobile viewport with a scrollable body', (file) => {
    const source = readWorkspaceAccessSource(file);

    expect(source).toContain('max-h-[calc(100dvh-1rem)]');
    expect(source).toContain('max-sm:bottom-0');
    expect(source).toContain('overflow-y-auto overscroll-contain');
    expect(source).toContain('<DialogFooter');
  });

  it('uses compact navigation and controls on small screens', () => {
    const toolbar = readWorkspaceAccessSource(
      'workspace-access-tabs-toolbar.tsx'
    );
    const memberRow = readWorkspaceAccessSource(
      'workspace-access-member-row.tsx'
    );

    expect(toolbar).toContain('grid-cols-4');
    expect(toolbar).toContain('sr-only sm:hidden');
    expect(memberRow).toContain('size-9 shrink-0 px-0 sm:w-auto');
  });
});
