import type { DehydratedState } from '@tanstack/react-query';
import { z } from 'zod';

const jsonValue = z.json();
const optionalJsonValue = jsonValue.optional();
// This model seeds a new QueryClient with one completed boards read, not mutations
// or pending work. Validate unknown cache slots instead of waiving serialization.
export function boardsTransportState(state: DehydratedState) {
  return {
    ...state,
    mutations: z.array(z.never()).parse(state.mutations),
    queries: state.queries.map((query) => ({
      ...query,
      queryKey: z.array(jsonValue).parse(query.queryKey),
      meta: z.record(z.string(), jsonValue).optional().parse(query.meta),
      promise: z.undefined().parse(query.promise),
      state: {
        ...query.state,
        data: optionalJsonValue.parse(query.state.data),
        error: z.null().parse(query.state.error),
        fetchFailureReason: z.null().parse(query.state.fetchFailureReason),
      },
    })),
  };
}
