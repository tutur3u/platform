import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function readSidebarSource(fileName: string) {
  const candidates = [
    join(process.cwd(), 'src/components/ui/custom', fileName),
    join(process.cwd(), 'packages/ui/src/components/ui/custom', fileName),
  ];
  const sourcePath = candidates.find((candidate) => existsSync(candidate));

  if (!sourcePath) {
    throw new Error(`Unable to resolve ${fileName} from ${process.cwd()}`);
  }

  return readFileSync(sourcePath, 'utf8');
}

const sidebarContextSource = readSidebarSource('sidebar-context.tsx');
const sidebarRemoteBehaviorBridgeSource = readSidebarSource(
  'sidebar-remote-behavior-bridge.tsx'
);

function staticImportPattern(modulePath: string) {
  const escapedModulePath = modulePath.replace(
    /[.*+?^${}()|[\]\\]/gu,
    String.raw`\$&`
  );

  return new RegExp(
    String.raw`^\s*import\s+(?!type\b)[\s\S]*?\sfrom\s+['"]${escapedModulePath}['"];`,
    'mu'
  );
}

function dynamicImportPattern(modulePath: string) {
  const escapedModulePath = modulePath.replace(
    /[.*+?^${}()|[\]\\]/gu,
    String.raw`\$&`
  );

  return new RegExp(
    String.raw`import\s*\(\s*['"]${escapedModulePath}['"]\s*\)`,
    'mu'
  );
}

describe('sidebar context compile graph', () => {
  it('loads remote user-config sync after hydration', () => {
    expect(sidebarContextSource).not.toMatch(
      staticImportPattern('@tuturuuu/ui/hooks/use-user-config')
    );
    expect(sidebarContextSource).toMatch(
      dynamicImportPattern('./sidebar-remote-behavior-bridge')
    );
    expect(sidebarRemoteBehaviorBridgeSource).toMatch(
      staticImportPattern('@tuturuuu/ui/hooks/use-user-config')
    );
  });
});
