import { stagingFetch } from '../../../scripts/wave1-staging/response';
import worker from './worker';

export default {
  async fetch(...args: Parameters<typeof worker.fetch>) {
    return stagingFetch(args[0], 'calendar', args[1], () =>
      worker.fetch(...args)
    );
  },
};
