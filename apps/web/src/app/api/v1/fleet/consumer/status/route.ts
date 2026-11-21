import { z } from 'zod';
import { consumerRoute } from '../request';

export const POST = consumerRoute(z.strictObject({}), (db) =>
  db.rpc('fleet_consumer_status')
);
