import { createBridgeStartHandler } from '@tuturuuu/start-bridge/start/server-entry';
import { createContactsCandidateHandler } from './handler';

const start = createBridgeStartHandler();
export default {
  fetch: createContactsCandidateHandler({ start: start.fetch }),
};
