import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('satellite workspace settings panels', () => {
  it('disables guest access and omits invitation tools in personal workspaces', () => {
    const source = readFileSync(
      join(
        process.cwd(),
        'src/components/workspace-settings/workspace-settings-panels.tsx'
      ),
      'utf8'
    );

    expect(source).toContain(
      'disabled={workspace.personal || !canManageMembers}'
    );
    expect(source).toContain('{!workspace.personal ? (');
    expect(source).toContain('disableInvite={invitationsDisabled}');
  });
});
