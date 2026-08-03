import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SATELLITE_WORKSPACE_SELECTORS = [
  'ai/src/app/[locale]/[wsId]/workspace-select.tsx',
  'calendar/src/app/[locale]/(dashboard)/[wsId]/workspace-select.tsx',
  'chat/src/app/[locale]/(dashboard)/[wsId]/workspace-select.tsx',
  'contacts/src/app/[locale]/[wsId]/workspace-select.tsx',
  'drive/src/app/[locale]/(dashboard)/[wsId]/workspace-select.tsx',
  'finance/src/app/[locale]/(dashboard)/[wsId]/workspace-select.tsx',
  'forms/src/app/[locale]/[wsId]/workspace-select.tsx',
  'inventory/src/app/[locale]/(dashboard)/[wsId]/workspace-select.tsx',
  'meet/src/app/[locale]/[wsId]/workspace-select.tsx',
  'rewise/src/app/[locale]/(dashboard)/[wsId]/workspace-select.tsx',
  'tasks/src/app/[locale]/(dashboard)/[wsId]/workspace-select.tsx',
  'track/src/app/[locale]/(dashboard)/[wsId]/workspace-select.tsx',
] as const;

function readAppSource(relativePath: string) {
  return readFileSync(resolve(process.cwd(), '..', relativePath), 'utf8');
}

describe('satellite workspace creation handoff', () => {
  it.each(SATELLITE_WORKSPACE_SELECTORS)(
    'routes new workspaces from %s through Platform setup',
    (relativePath) => {
      expect(readAppSource(relativePath)).toContain(
        'platformWorkspaceSetupUrl='
      );
    }
  );

  it('sends new Tasks workspaces to the valid task entrypoint', () => {
    const source = readAppSource(
      'tasks/src/app/[locale]/(dashboard)/[wsId]/workspace-select.tsx'
    );

    expect(source).toContain("customRedirectSuffix ?? 'tasks'");
  });

  it('keeps Platform workspace creation on its local route', () => {
    const source = readFileSync(
      resolve(
        process.cwd(),
        'src/app/[locale]/(dashboard)/[wsId]/workspace-select.tsx'
      ),
      'utf8'
    );

    expect(source).not.toContain('platformWorkspaceSetupUrl');
  });
});
