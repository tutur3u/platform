import { defaultContentSecurityPolicy } from '@tuturuuu/start-bridge/csp';
import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';
import { invalidCalendarDeploymentProfile } from './src/runtime/deployment-profile';

// Each artifact serves only its own environment's host. The profile is a
// build-time literal (see vite.config.mts), so the other list folds away and
// the artifact scan can prove it is absent. There is no default profile.
export default defineBridgeAppConfig({
  mounts: {
    rootHosts:
      process.env.CALENDAR_DEPLOYMENT_PROFILE === 'production'
        ? ['calendar.tuturuuu.com']
        : process.env.CALENDAR_DEPLOYMENT_PROFILE === 'staging'
          ? ['calendar.tutur3u.com']
          : process.env.CALENDAR_DEPLOYMENT_PROFILE === 'development'
            ? [
                'calendar.tuturuuu.localhost',
                'localhost:7806',
                '127.0.0.1:7806',
              ]
            : invalidCalendarDeploymentProfile(),
    mountHosts: [],
    unknownHost: 'reject',
  },
  csp: defaultContentSecurityPolicy,
});
