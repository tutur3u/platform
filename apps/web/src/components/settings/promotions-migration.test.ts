import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const settingsRoot = join(process.cwd(), 'src/components/settings');

describe('promotions settings migration', () => {
  it('does not expose the legacy referral editor after Inventory takes ownership', () => {
    const navigation = readFileSync(
      join(settingsRoot, 'settings-dialog-nav-domain.ts'),
      'utf8'
    );
    const content = readFileSync(
      join(settingsRoot, 'settings-dialog-content.tsx'),
      'utf8'
    );
    const lazyPanels = readFileSync(
      join(settingsRoot, 'settings-dialog-lazy-panels.tsx'),
      'utf8'
    );

    expect(navigation).not.toContain("name: 'referrals'");
    expect(content).not.toContain("activeTab === 'referrals'");
    expect(lazyPanels).not.toContain('ReferralSettings');
  });
});
