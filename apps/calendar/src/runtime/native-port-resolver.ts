export function createCalendarNativePortResolver(
  local: (path: string) => string
) {
  const required = [
    'workspace breadcrumb',
    'realtime logging',
    'request telemetry',
    'workspace actions',
  ];
  const observed = new Set<string>();
  function replacement(name: string, path: string) {
    observed.add(name);
    return local(path);
  }
  return {
    reset: () => observed.clear(),
    resolveId(source: string, importer?: string) {
      if (!importer) return;
      if (
        importer.endsWith(
          '/packages/satellite/src/components/workspace-settings/settings-workspace-breadcrumb.tsx'
        ) &&
        source === '../../utils/workspace-actions'
      )
        return replacement(
          'workspace breadcrumb',
          './src/runtime/workspace-actions.ts'
        );
      if (
        importer.endsWith(
          '/packages/supabase/src/next/realtime-log-provider.tsx'
        ) &&
        source === './realtime-log-actions'
      )
        return replacement(
          'realtime logging',
          './src/runtime/realtime-log-actions.ts'
        );
      if (
        importer.includes('/apps/calendar/') &&
        !importer.endsWith('/legacy-telemetry-supplier.server.ts') &&
        /(?:^|\/)infrastructure\/log-drain$/u.test(source)
      )
        return replacement(
          'request telemetry',
          './src/runtime/request-telemetry.server.ts'
        );
      if (
        importer.includes('/apps/calendar/') &&
        /(?:^|\/)actions$/u.test(source) &&
        importer.includes('/(dashboard)/[wsId]/')
      )
        return replacement(
          'workspace actions',
          './src/runtime/workspace-actions.ts'
        );
    },
    assertComplete() {
      const missing = required.filter((name) => !observed.has(name));
      if (missing.length)
        throw new Error(
          `Calendar native port substitutions did not run: ${missing.join(', ')}`
        );
    },
  };
}
