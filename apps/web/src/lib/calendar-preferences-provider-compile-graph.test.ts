import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const calendarPreferencesProviderSource = readFileSync(
  join(process.cwd(), 'src/lib/calendar-preferences-provider.tsx'),
  {
    encoding: 'utf8',
  }
);
const calendarPreferencesSettingsBridgeSource = readFileSync(
  join(process.cwd(), 'src/lib/calendar-preferences-settings-bridge.tsx'),
  {
    encoding: 'utf8',
  }
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

describe('calendar preferences provider compile graph', () => {
  it('loads the settings query bridge after hydration', () => {
    expect(calendarPreferencesProviderSource).not.toMatch(
      staticImportPattern('@tanstack/react-query')
    );
    expect(calendarPreferencesProviderSource).not.toMatch(
      staticImportPattern('./calendar-preferences-settings-bridge')
    );
    expect(calendarPreferencesProviderSource).toMatch(
      dynamicImportPattern('./calendar-preferences-settings-bridge')
    );
  });

  it('loads internal API clients only when calendar preference queries run', () => {
    for (const modulePath of [
      '@tuturuuu/internal-api/settings',
      '@tuturuuu/internal-api/users',
    ] as const) {
      expect(calendarPreferencesSettingsBridgeSource).not.toMatch(
        staticImportPattern(modulePath)
      );
      expect(calendarPreferencesSettingsBridgeSource).toMatch(
        dynamicImportPattern(modulePath)
      );
    }
  });
});
