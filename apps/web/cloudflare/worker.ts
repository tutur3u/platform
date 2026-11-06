import { createWebCandidateHandler } from './handler';
import { staticStartHandler } from './start/static-handler';

export default {
  fetch: createWebCandidateHandler({ start: staticStartHandler }),
};
