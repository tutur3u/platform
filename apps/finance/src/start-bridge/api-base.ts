import { createApiPath } from '@tuturuuu/start-bridge/app-url';
import { financeCentralFirst } from './api-ownership';
import { appApiPatterns } from './api-patterns.bridge.gen';

export const financeApiPath = createApiPath(
  appApiPatterns,
  financeCentralFirst
);
