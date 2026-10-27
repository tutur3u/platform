import { createBridgeStartHandler } from '@tuturuuu/start-bridge/start/server-entry';
import { createWebCandidateHandler } from './handler';

const start = createBridgeStartHandler();
export default { fetch: createWebCandidateHandler({ start: start.fetch }) };
