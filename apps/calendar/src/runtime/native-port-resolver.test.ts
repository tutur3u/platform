import { expect, it } from 'vitest';
import { createCalendarNativePortResolver } from './native-port-resolver';

const inputs = [
  [
    '../../utils/workspace-actions',
    '/repo/packages/satellite/src/components/workspace-settings/settings-workspace-breadcrumb.tsx',
  ],
  [
    './realtime-log-actions',
    '/repo/packages/supabase/src/next/realtime-log-provider.tsx',
  ],
  [
    '@tuturuuu/utils/infrastructure/log-drain',
    '/repo/apps/calendar/src/proxy.ts',
  ],
  [
    './actions',
    '/repo/apps/calendar/src/app/[locale]/(dashboard)/[wsId]/client.tsx',
  ],
];
it('admits a build only after all required ports resolve', () => {
  const ports = createCalendarNativePortResolver(
    (path) => `/repo/apps/calendar/${path}`
  );
  for (const [source, importer] of inputs) {
    if (!source || !importer) throw new Error('Missing fixture');
    expect(ports.resolveId(source, importer)).toMatch(/\/src\/runtime\//u);
  }
  expect(() => ports.assertComplete()).not.toThrow();
  ports.reset();
  expect(() => ports.assertComplete()).toThrow('workspace breadcrumb');
});
it('fails a moved supplier instead of admitting its original server actions', () => {
  const ports = createCalendarNativePortResolver((path) => path);
  for (const [source, importer] of inputs) {
    if (!source || !importer) throw new Error('Missing fixture');
    ports.resolveId(
      source,
      importer.replace('/workspace-settings/', '/workspace-settings-moved/')
    );
  }
  expect(() => ports.assertComplete()).toThrow('workspace breadcrumb');
  expect(
    ports.resolveId(
      '@tuturuuu/utils/infrastructure/log-drain',
      '/repo/apps/calendar/src/runtime/legacy-telemetry-supplier.server.ts'
    )
  ).toBeUndefined();
});
