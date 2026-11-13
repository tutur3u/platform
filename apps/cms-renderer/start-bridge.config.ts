import { defineBridgeAppConfig } from '@tuturuuu/start-bridge/start/app-config';

export default defineBridgeAppConfig({
  mounts: { unknownHost: 'reject' },
  worker: { workersDev: false },
});
