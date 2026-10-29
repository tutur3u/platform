import { defaultContentSecurityPolicy } from '@tuturuuu/start-bridge/csp';
import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';

export default defineBridgeAppConfig({
  mounts: {
    rootHosts: [
      'calendar.tuturuuu.com',
      'calendar.staging.tutur3u.com',
      'calendar-cutover.staging.tutur3u.com',
    ],
    mountHosts: [],
    unknownHost: 'reject',
  },
  csp: defaultContentSecurityPolicy,
});
