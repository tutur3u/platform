import { sortEndpoints } from '@tuturuuu/start-bridge/endpoints';
import * as roomPreview from '../app/[locale]/r/[code]/preview/route';
import { endpoints } from './api-registry.bridge.gen';

export const meetEndpoints = sortEndpoints([
  ...endpoints,
  { pattern: '/[locale]/r/[code]/preview', module: roomPreview },
]);
