import { defaultContentSecurityPolicy } from '@tuturuuu/start-bridge/csp';
import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';

export default defineBridgeAppConfig({
  mounts: {
    rootHosts: [
      'calendar.tuturuuu.com',
      'calendar-staging.tuturuuu.com',
      'calendar-cutover.tuturuuu.com',
    ],
    mountHosts: [],
    unknownHost: 'reject',
  },
  csp: defaultContentSecurityPolicy,
});
