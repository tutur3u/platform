// App-owned start-bridge Worker options for cms: the codemod created this
// file and never overwrites it. See "Worker options" in
// apps/docs/build/devops/start-bridge-codemod.mdx.
import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';

export default defineBridgeAppConfig({
  mounts: {
    rootHosts: ['cms.tuturuuu.com', 'cms-staging.tuturuuu.com'],
    mountHosts: [],
    unknownHost: 'reject',
  },
});
