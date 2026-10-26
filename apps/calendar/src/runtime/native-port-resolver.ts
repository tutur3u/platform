export function createCalendarNativePortResolver(
  local: (path: string) => string
) {
  const required = {
    client: ['realtime logging'],
    ssr: ['workspace breadcrumb', 'request telemetry', 'workspace actions'],
  };
  const observed = new Map<string, Set<string>>();
  function replacement(environment: string, name: string, path: string) {
    const ports = observed.get(environment) ?? new Set<string>();
    ports.add(name);
    observed.set(environment, ports);
    return local(path);
  }
  return {
    reset: () => observed.clear(),
    resolveId(
      source: string,
      importer: string | undefined,
      environment: string
    ) {
      if (!importer) return;
      if (
        importer.endsWith(
          '/packages/satellite/src/components/workspace-settings/settings-workspace-breadcrumb.tsx'
        ) &&
        source === '../../utils/workspace-actions'
      )
        return replacement(
          environment,
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
          environment,
          'realtime logging',
          './src/runtime/realtime-log-actions.ts'
        );
      if (
        importer.includes('/apps/calendar/') &&
        !importer.endsWith('/legacy-telemetry-supplier.server.ts') &&
        /(?:^|\/)infrastructure\/log-drain$/u.test(source)
      )
        return replacement(
          environment,
          'request telemetry',
          './src/runtime/request-telemetry.server.ts'
        );
      if (
        importer.includes('/apps/calendar/') &&
        /(?:^|\/)actions$/u.test(source) &&
        importer.includes('/(dashboard)/[wsId]/')
      )
        return replacement(
          environment,
          'workspace actions',
          './src/runtime/workspace-actions.ts'
        );
    },
    assertComplete(environment: keyof typeof required) {
      const missing = required[environment].filter(
        (name) => !observed.get(environment)?.has(name)
      );
      if (missing.length)
        throw new Error(
          `Calendar ${environment} native port substitutions did not run: ${missing.join(', ')}`
        );
    },
  };
}
