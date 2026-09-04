import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const sidebarSource = readFileSync(
  join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/[wsId]/rewise-sidebar-chats.tsx'
  ),
  'utf8'
);
const chatLinkSource = readFileSync(
  join(process.cwd(), 'src/app/[locale]/(dashboard)/[wsId]/chat-link.tsx'),
  'utf8'
);
const navSource = readFileSync(
  join(process.cwd(), 'src/app/[locale]/(dashboard)/[wsId]/nav.tsx'),
  'utf8'
);

describe('Rewise conversation sidebar contract', () => {
  it('keeps visible space between the Chats trigger and its first action', () => {
    expect(sidebarSource).toContain('className="pt-2"');
  });

  it('uses explicit section spacing and semantic active colors', () => {
    expect(navSource).toContain('className="grid gap-4 pt-1"');
    expect(chatLinkSource).toContain(
      'bg-accent text-accent-foreground shadow-sm'
    );
    expect(chatLinkSource).not.toContain('bg-linear-to-br');
  });
});
