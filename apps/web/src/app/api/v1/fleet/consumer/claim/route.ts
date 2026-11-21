import { consumerRoute, slotSchema } from '../request';

export const POST = consumerRoute(slotSchema, (db, input) =>
  db.rpc('fleet_consumer_claim', {
    p_generation: input.generation,
    p_slot: input.slot,
  })
);
