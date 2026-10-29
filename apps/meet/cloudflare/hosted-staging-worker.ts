import { stagingFetch } from '../../../scripts/wave1-staging/response';
import worker from './worker';

export { MeetingAIProvider, MeetLiveDurableObject } from './worker';

export default {
  async fetch(...args: Parameters<typeof worker.fetch>) {
    return stagingFetch(args[0], 'meet', args[1], () => worker.fetch(...args));
  },
};
