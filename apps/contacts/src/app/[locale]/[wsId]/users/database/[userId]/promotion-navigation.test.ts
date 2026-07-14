import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const contactsRoot = process.cwd().endsWith('/apps/contacts')
  ? process.cwd()
  : join(process.cwd(), 'apps/contacts');

describe('Contacts promotion navigation', () => {
  it('links promotion and referral management to the first-class Inventory route', () => {
    const linkedPromotions = readFileSync(
      join(
        contactsRoot,
        'src/app/[locale]/[wsId]/users/database/[userId]/linked-promotions-client.tsx'
      ),
      'utf8'
    );
    const referrals = readFileSync(
      join(
        contactsRoot,
        'src/app/[locale]/[wsId]/users/database/[userId]/referral-section-client.tsx'
      ),
      'utf8'
    );

    expect(linkedPromotions).toMatch(
      /`\$\{INVENTORY_APP_URL\}\/\$\{wsId\}\/promotions`/
    );
    expect(linkedPromotions).not.toContain('commerce?tab=promotions');
    expect(referrals).toMatch(
      /`\$\{INVENTORY_APP_URL\}\/\$\{wsId\}\/promotions\?section=referrals`/
    );
  });
});
