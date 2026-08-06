import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repoRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../..'
);

function source(path: string) {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('notification and invitation shell coverage', () => {
  it('passes the authenticated web navbar identity into the bell without a second lookup', () => {
    const navbar = source('apps/web/src/app/[locale]/navbar-actions.tsx');
    const popover = source(
      'apps/web/src/app/[locale]/notification-popover.tsx'
    );

    expect(navbar).toContain(
      '<NotificationPopover userId={authenticatedUser.id} />'
    );
    expect(popover).toContain('userId={userId}');
    expect(popover).not.toContain('getCurrentSupabaseUser');
  });

  it('keeps the shared bell visible on narrow viewports and exposes retry', () => {
    const popover = source(
      'packages/ui/src/components/ui/custom/notification-popover-client.tsx'
    );

    expect(popover).toContain('className="group relative flex size-10');
    expect(popover).not.toContain('hidden flex-none transition-all md:flex');
    expect(popover).toContain('onClick={() => query.refetch()}');
    expect(popover).toContain('aria-label={notificationsText}');
  });

  it('keeps pending invitation actions in the shared workspace picker', () => {
    const picker = source(
      'packages/ui/src/components/ui/custom/workspace-select.tsx'
    );

    expect(picker).toContain('listWorkspaceInvitations');
    expect(picker).toContain("action: 'accept'");
    expect(picker).toContain("action: 'decline'");
    expect(picker).toContain("queryKey: ['workspace-invitations']");
    expect(picker).toContain('event.stopPropagation()');
  });

  it.each([
    'apps/learn/src/app/[locale]/(dashboard)/[wsId]/layout.tsx',
    'apps/teach/src/components/teach-workspace-shell.tsx',
    'apps/nova/src/app/[locale]/(marketing)/navbar-actions.tsx',
    'apps/storefront/src/app/[locale]/storefront-header-actions.tsx',
  ])('renders the shared notification popover in %s', (path) => {
    expect(source(path)).toContain('NotificationPopover');
  });

  it('uses the shared invitation-aware picker in Learn and Teach', () => {
    expect(
      source('apps/learn/src/components/learner-shell-parts.tsx')
    ).toContain('WorkspaceSelect as SharedWorkspaceSelect');
    expect(
      source('apps/teach/src/components/teach-workspace-select.tsx')
    ).toContain("from '@tuturuuu/ui/custom/workspace-select'");
  });
});
