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
    const peopleFilters = readWorkspaceAccessSource(
      'workspace-access-people-filters.tsx'
    );

    expect(toolbar).toContain('grid-cols-4');
    expect(toolbar).toContain('shrink-0 grid-cols-4');
    expect(toolbar).not.toContain('2xl:flex-row');
    expect(toolbar).toContain('sr-only sm:hidden');
    expect(memberRow).toContain('size-8 shrink-0');
    expect(memberRow).toContain('<DropdownMenuContent');
    expect(memberRow).not.toContain('sm:grid-cols-[1fr_auto]');
    expect(peopleFilters).toContain('className="h-full min-h-0"');
  });

  it('creates the recommended administrator role with only the admin grant', () => {
    const page = readWorkspaceAccessSource('workspace-access-page.tsx');

    expect(page).toContain("permissions: [{ enabled: true, id: 'admin' }]");
    expect(page).not.toContain(
      'permissions: permissionDefinitions.map((permission)'
    );
  });
});
