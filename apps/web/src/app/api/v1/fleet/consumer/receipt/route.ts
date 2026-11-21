import { consumerRoute, receiptSchema } from '../request';

export const POST = consumerRoute(receiptSchema, (db, input) =>
  db.rpc('fleet_consumer_receipt', {
    p_generation: input.generation,
    p_slot: input.slot,
    p_intent_id: input.id,
    p_lease_id: input.leaseId,
    p_idempotency_key: input.idempotencyKey,
    p_state: input.state,
  })
);
